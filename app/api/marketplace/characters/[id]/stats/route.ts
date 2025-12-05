import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { marketplaceService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[Marketplace API] Getting stats for character:", id);

    const character = await marketplaceService.getCharacterById(id, true);

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
