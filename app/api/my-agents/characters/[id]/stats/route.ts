import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { myAgentsService } from "@/lib/services/my-agents";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[My Agents API] Getting stats for character:", id);

    const character = await myAgentsService.getCharacterById(id, true);

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
    logger.error("[My Agents API] Error getting character stats:", error);

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

