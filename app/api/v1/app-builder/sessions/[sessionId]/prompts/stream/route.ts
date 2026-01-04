import type { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { checkRateLimitAsync } from "@/lib/middleware/rate-limit";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { createStreamWriter, SSE_HEADERS } from "@/lib/api/stream-utils";

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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    await aiAppBuilder.verifySessionOwnership(sessionId, user.id);

    const rateLimitResult = await checkRateLimitAsync(request, PROMPT_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      const maxRequests = PROMPT_RATE_LIMIT.maxRequests;
      const windowSeconds = PROMPT_RATE_LIMIT.windowMs / 1000;
      return new Response(
        JSON.stringify({
          success: false,
          error: `Rate limit exceeded. Maximum ${maxRequests} prompts per ${windowSeconds}s.`,
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
          },
        }
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
        { status: 400, headers: { "Content-Type": "application/json" } }
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
        const result = await aiAppBuilder.sendPrompt(
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
          }
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
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send prompt";

        // Reset session status to "ready" so user can try again
        try {
          await aiAppBuilder.resetSessionStatus(sessionId, user.id);
        } catch (resetError) {
          logger.warn("Failed to reset session status after error", {
            sessionId,
            resetError,
          });
        }

        if (
          errorMessage.includes("aborted") ||
          errorMessage.includes("cancelled")
        ) {
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

    return new Response(stream.readable, { headers: SSE_HEADERS });
  } catch (error) {
    logger.error("Auth or ownership verification failed for prompt stream", { error });
    const status = getErrorStatusCode(error);
    const message = getSafeErrorMessage(error);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }
}
