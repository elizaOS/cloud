import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/characters/[id]/stats
 * 
 * @deprecated Use /api/my-agents/characters/[id]/stats instead.
 * This endpoint is maintained for backwards compatibility.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAuth();
  const { id } = await params;

  logger.debug("[Marketplace API] Getting stats for character:", id);

  const character = await characterMarketplaceService.getCharacterById(id, true);

  if (!character) {
    return NextResponse.json(
      { success: false, error: "Character not found" },
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
}
