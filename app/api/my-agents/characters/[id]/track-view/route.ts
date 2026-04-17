import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-agents/characters/[id]/track-view
 * Tracks a view of a character.
 * The marketplace tracking backend was removed, so this endpoint is gone.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    logger.warn("[My Agents API] Rejecting removed track-view route", {
      characterId: id,
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "Character view tracking was removed with the marketplace service",
      },
      { status: 410 },
    );
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Failed to track view" },
      { status: 500 },
    );
  }
}
