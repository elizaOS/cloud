import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await requireAuthWithOrg();
  const { sessionId } = await params;

  logger.info("Manual backup request", { sessionId, userId: user.id });

  try {
    const body = await req.json().catch(() => ({}));
    const snapshotType = body.snapshotType || "manual";

    const result = await aiAppBuilderService.triggerBackup(
      sessionId,
      user.id,
      snapshotType,
    );

    return NextResponse.json({
      success: true,
      filesBackedUp: result.filesBackedUp,
      totalSize: result.totalSize,
    });
  } catch (error) {
    logger.error("Backup failed", {
      sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Backup failed" },
      { status: 500 },
    );
  }
}
