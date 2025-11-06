import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { myAgentsService } from "@/lib/services/my-agents";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[My Agents API] Tracking view for character:", id);

    const result = await myAgentsService.trackView(id);

    return NextResponse.json({
      success: result.success,
      data: {
        viewCount: result.count,
      },
    });
  } catch (error) {
    logger.error("[My Agents API] Error tracking view:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to track view",
      },
      { status: 500 },
    );
  }
}
