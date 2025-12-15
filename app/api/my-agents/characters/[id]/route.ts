import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { characterMarketplaceService as myAgentsService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-agents/characters/[id]
 * Get a specific character by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  const character = await myAgentsService.getCharacterById(id, user.id);

  if (!character) {
    return NextResponse.json(
      { success: false, error: "Character not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: { character } });
}

/**
 * DELETE /api/my-agents/characters/[id]
 * Delete a character owned by the user.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  logger.info("[My Agents API] Deleting character:", {
    characterId: id,
    userId: user.id,
  });

  const deleted = await myAgentsService.deleteCharacter(id, user.id);

  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { message: "Character deleted successfully" },
  });
}
