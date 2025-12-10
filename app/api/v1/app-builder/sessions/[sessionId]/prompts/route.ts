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

/**
 * POST /api/v1/app-builder/sessions/:sessionId/prompts
 * Send a prompt to Claude Code in the sandbox
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const body = await request.json();
    const validationResult = SendPromptSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const result = await aiAppBuilderService.sendPrompt(
      sessionId,
      validationResult.data.prompt,
      user.id
    );

    return NextResponse.json({
      success: result.success,
      output: result.output,
      filesAffected: result.filesAffected,
      error: result.error,
    });
  } catch (error) {
    logger.error("Failed to send prompt", { error });
    const status = (error as Error).message?.includes("Access denied") ? 403 : 500;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send prompt",
      },
      { status }
    );
  }
}
