import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { myAgentsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-agents/characters/[id]/track-view
 * Tracks a view event for a user's character.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the character ID.
 * @returns Updated view count.
 */
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
