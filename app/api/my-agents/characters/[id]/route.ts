import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-agents/characters/[id]
 * Get a specific character by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  const character = await charactersService.getByIdForUser(id, user.id);

  if (!character) {
    return NextResponse.json(
      { success: false, error: "Character not found" },
      { status: 404 }
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
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id } = await params;

  logger.info("[My Agents API] Deleting character:", {
    characterId: id,
    userId: user.id,
  });

  // Verify ownership first
  const character = await charactersService.getByIdForUser(id, user.id);
  if (!character) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 }
    );
  }

  await charactersService.delete(id);

  return NextResponse.json({
    success: true,
    data: { message: "Character deleted successfully" },
  });
}
