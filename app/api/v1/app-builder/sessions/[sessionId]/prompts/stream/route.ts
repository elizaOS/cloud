import { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const PROMPT_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: process.env.NODE_ENV === "production" ? 20 : 100, // 20 prompts/min in prod
};

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const SendPromptSchema = z.object({
  prompt: z.string().min(1).max(10000),
});

/**
 * POST /api/v1/app-builder/sessions/:sessionId/prompts/stream
 * Send a prompt with SSE streaming for tool calls and thinking
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    // Verify user owns this session
    await aiAppBuilderService.verifySessionOwnership(sessionId, user.id);

    // Rate limit check
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

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (event: string, data: unknown) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Run prompt in background with callbacks
    (async () => {
      try {
        const result = await aiAppBuilderService.sendPrompt(
          sessionId,
          validationResult.data.prompt,
          user.id,
          {
            onThinking: async (text) => {
              // Send thinking/reasoning text
              await sendEvent("thinking", {
                text: text.substring(0, 1000), // Limit size
              });
            },
            onToolUse: async (tool, input, result) => {
              await sendEvent("tool_use", {
                tool,
                input,
                result: result.substring(0, 500),
              });
            },
          },
        );

        await sendEvent("complete", {
          success: result.success,
          output: result.output,
          filesAffected: result.filesAffected,
          error: result.error,
        });
      } catch (error) {
        logger.error("Failed to send prompt via stream", { error });
        await sendEvent("error", {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to send prompt",
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("Auth or ownership verification failed for prompt stream", {
      error,
    });
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
        ? 404
        : 401;
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }
}
