import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await requireAuthWithOrg();
  const { sessionId } = await params;

  logger.info("Get snapshot info request", { sessionId, userId: user.id });

  try {
    const info = await aiAppBuilderService.getSessionSnapshotInfo(
      sessionId,
      user.id,
    );

    return NextResponse.json({
      success: true,
      ...info,
    });
  } catch (error) {
    logger.error("Get snapshot info failed", {
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get snapshot info",
      },
      { status: 500 },
    );
  }
}
