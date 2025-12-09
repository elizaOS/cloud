import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * GET /api/v1/app-builder/sessions/:sessionId
 * Get details of a specific app builder session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const session = await aiAppBuilderService.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error("Failed to get app builder session", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get session",
      },
      { status: 500 }
    );
  }
}

const ExtendSessionSchema = z.object({
  durationMs: z.number().min(60000).max(3600000).default(900000), // 1 min to 1 hour, default 15 min
});

/**
 * PATCH /api/v1/app-builder/sessions/:sessionId
 * Extend session timeout
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const body = await request.json();
    const validationResult = ExtendSessionSchema.safeParse(body);

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

    await aiAppBuilderService.extendSession(
      sessionId,
      validationResult.data.durationMs
    );

    return NextResponse.json({
      success: true,
      message: "Session extended successfully",
    });
  } catch (error) {
    logger.error("Failed to extend app builder session", { error });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to extend session",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/app-builder/sessions/:sessionId
 * Stop and cleanup the session
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    await aiAppBuilderService.stopSession(sessionId);

    return NextResponse.json({
      success: true,
      message: "Session stopped successfully",
    });
  } catch (error) {
    logger.error("Failed to stop app builder session", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop session",
      },
      { status: 500 }
    );
  }
}
