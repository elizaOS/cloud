import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterMarketplaceService as marketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/characters/[id]/track-view
 * Tracks a view event for a marketplace character.
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

    logger.debug("[Marketplace API] Tracking view for character:", id);

    const result = await characterMarketplaceService.trackView(id);

    return NextResponse.json({
      success: result.success,
      data: {
        viewCount: result.count,
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error tracking view:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to track view",
      },
      { status: 500 },
    );
  }
}
