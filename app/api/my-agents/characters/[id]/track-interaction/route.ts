import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-agents/characters/[id]/track-interaction
 * Tracks an interaction with a character.
 * The marketplace tracking backend was removed, so this endpoint is gone.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuthWithOrg();
    const { id } = await params;

    logger.warn("[My Agents API] Rejecting removed track-interaction route", {
      characterId: id,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Character interaction tracking was removed with the marketplace service",
      },
      { status: 410 },
    );
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Failed to track interaction" },
      { status: 500 },
    );
  }
}
