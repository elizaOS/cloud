import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/characters/[id]/track-interaction
 * Tracks an interaction event for a marketplace character.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the character ID.
 * @returns Updated interaction count.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[Marketplace API] Tracking interaction for character:", id);

    const result = await characterMarketplaceService.trackInteraction(id);

    return NextResponse.json({
      success: result.success,
      data: {
        interactionCount: result.count,
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error tracking interaction:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to track interaction",
      },
      { status: 500 },
    );
  }
}
