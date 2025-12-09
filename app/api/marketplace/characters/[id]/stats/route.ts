import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/characters/[id]/stats
 * Gets statistics for a marketplace character.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the character ID.
 * @returns Character statistics including message count, room count, and deployment status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[Marketplace API] Getting stats for character:", id);

    const character = await characterMarketplaceService.getCharacterById(id, true);

    if (!character) {
      return NextResponse.json(
        {
          success: false,
          error: "Character not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        characterId: character.id,
        stats: character.stats || {
          messageCount: 0,
          roomCount: 0,
          lastActiveAt: null,
          deploymentStatus: "draft" as const,
        },
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error getting character stats:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get character stats",
      },
      { status: 500 },
    );
  }
}
