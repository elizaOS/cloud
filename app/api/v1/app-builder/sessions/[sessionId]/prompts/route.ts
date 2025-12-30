import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

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
