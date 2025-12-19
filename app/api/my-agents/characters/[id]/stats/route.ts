import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-agents/characters/[id]/stats
 * Get statistics for a character.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;

    const character = await charactersService.getByIdForUser(id, user.id);
    if (!character) {
      return NextResponse.json(
        { success: false, error: "Character not found" },
        { status: 404 }
      );
    }

    // Return basic stats - detailed stats were part of marketplace service
    return NextResponse.json({
      success: true,
      data: {
        stats: {
          viewCount: 0,
          interactionCount: 0,
          cloneCount: 0,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
