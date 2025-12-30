import { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const PROMPT_RATE_LIMIT = {
  windowMs: 60000,
  maxRequests: process.env.NODE_ENV === "production" ? 20 : 100,
};

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const SendPromptSchema = z.object({
  prompt: z.string().min(1).max(10000),
});

interface StreamState {
  isClientConnected: boolean;
  lastEventTime: number;
  heartbeatInterval: NodeJS.Timeout | null;
}

function createStreamWriter(writer: WritableStreamDefaultWriter<Uint8Array>) {
  const encoder = new TextEncoder();
  const state: StreamState = {
    isClientConnected: true,
    lastEventTime: Date.now(),
    heartbeatInterval: null,
  };

  const sendEvent = async (event: string, data: unknown): Promise<boolean> => {
    if (!state.isClientConnected) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
      state.lastEventTime = Date.now();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("WritableStream") ||
        errorMessage.includes("closed") ||
        errorMessage.includes("aborted")
      ) {
        logger.info("Client disconnected during stream write");
        state.isClientConnected = false;
        return false;
      }
      logger.error("Error writing to stream", { error: errorMessage });
      state.isClientConnected = false;
      return false;
    }
  };

  const startHeartbeat = (intervalMs = 15000) => {
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
    }

    state.heartbeatInterval = setInterval(async () => {
      if (!state.isClientConnected) {
        stopHeartbeat();
        return;
      }

      const timeSinceLastEvent = Date.now() - state.lastEventTime;
      if (timeSinceLastEvent >= intervalMs - 1000) {
        const sent = await sendEvent("heartbeat", { timestamp: Date.now() });
        if (!sent) {
          stopHeartbeat();
        }
      }
    }, intervalMs);
  };

  const stopHeartbeat = () => {
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
    }
  };

  const close = async () => {
    stopHeartbeat();
    state.isClientConnected = false;

    try {
      await writer.close();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("closed") && !errorMessage.includes("aborted")) {
        logger.warn("Error closing stream writer", { error: errorMessage });
      }
    }
  };

  const isConnected = () => state.isClientConnected;

  return { sendEvent, startHeartbeat, stopHeartbeat, close, isConnected };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    await aiAppBuilderService.verifySessionOwnership(sessionId, user.id);

    const rateLimitResult = checkRateLimit(request, PROMPT_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Maximum 20 prompts per minute.",
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
          },
        },
      );
    }

    const body = await request.json();
    const validationResult = SendPromptSchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const stream = new TransformStream();
    const rawWriter = stream.writable.getWriter();
    const streamWriter = createStreamWriter(rawWriter);

    const abortController = new AbortController();

    request.signal?.addEventListener("abort", () => {
      logger.info("Client aborted request", { sessionId });
      abortController.abort();
    });

    (async () => {
      streamWriter.startHeartbeat(15000);

      try {
        const result = await aiAppBuilderService.sendPrompt(
          sessionId,
          validationResult.data.prompt,
          user.id,
          {
            onThinking: async (text) => {
              if (!streamWriter.isConnected()) return;
              await streamWriter.sendEvent("thinking", {
                text: text.substring(0, 1000),
              });
            },
            onToolUse: async (tool, input, result) => {
              if (!streamWriter.isConnected()) return;
              await streamWriter.sendEvent("tool_use", {
                tool,
                input,
                result: result.substring(0, 500),
              });
            },
            abortSignal: abortController.signal,
          },
        );

        if (streamWriter.isConnected()) {
          await streamWriter.sendEvent("complete", {
            success: result.success,
            output: result.output,
            filesAffected: result.filesAffected,
            error: result.error,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send prompt";

        if (errorMessage.includes("aborted") || errorMessage.includes("cancelled")) {
          logger.info("Prompt operation cancelled", { sessionId });
          if (streamWriter.isConnected()) {
            await streamWriter.sendEvent("cancelled", {
              success: false,
              error: "Operation cancelled",
            });
          }
        } else {
          logger.error("Failed to send prompt via stream", {
            error: errorMessage,
            sessionId,
          });
          if (streamWriter.isConnected()) {
            await streamWriter.sendEvent("error", {
              success: false,
              error: errorMessage,
            });
          }
        }
      } finally {
        await streamWriter.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    logger.error("Auth or ownership verification failed for prompt stream", {
      error,
    });
    const message =
      error instanceof Error ? error.message : "Authentication failed";

    let status = 500;
    if (message.includes("Authentication") || message.includes("Unauthorized")) {
      status = 401;
    } else if (message.includes("Access denied") || message.includes("Forbidden")) {
      status = 403;
    } else if (message.includes("not found") || message.includes("not ready")) {
      status = 404;
    } else if (message.includes("Rate limit")) {
      status = 429;
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }
}
