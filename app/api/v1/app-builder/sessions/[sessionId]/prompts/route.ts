import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const rateLimitResult = checkRateLimit(request, PROMPT_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Maximum ${PROMPT_RATE_LIMIT.maxRequests} prompts per minute.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
          },
        },
      );
    }

    await aiAppBuilderService.verifySessionOwnership(sessionId, user.id);

    const body = await request.json();
    const validationResult = SendPromptSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const result = await aiAppBuilderService.sendPrompt(
      sessionId,
      validationResult.data.prompt,
      user.id,
    );

    return NextResponse.json({
      success: result.success,
      output: result.output,
      filesAffected: result.filesAffected,
      error: result.error,
    });
  } catch (error) {
    logger.error("Failed to send prompt", { error });
    const message =
      error instanceof Error ? error.message : "Failed to send prompt";

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

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}
