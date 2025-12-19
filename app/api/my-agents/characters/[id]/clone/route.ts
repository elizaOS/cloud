import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/my-agents/characters/[id]/clone
 * Clones a character to create a new copy owned by the user.
 *
 * @param request - Request body with optional name and makePublic flag.
 * @param params - Route parameters containing the character ID to clone.
 * @returns Cloned character details.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;

    let body: { name?: string; makePublic?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine
    }

    logger.info("[My Agents API] Cloning character:", {
      characterId: id,
      userId: user.id,
      name: body.name,
    });

    // Get the original character
    const original = await charactersService.getById(id);
    if (!original) {
      return NextResponse.json(
        { success: false, error: "Character not found" },
        { status: 404 },
      );
    }

    // Create a clone
    const clonedCharacter = await charactersService.create({
      user_id: user.id,
      organization_id: user.organization_id!,
      name: body.name || `${original.name} (Copy)`,
      bio: original.bio,
      system: original.system,
      topics: original.topics,
      adjectives: original.adjectives,
      knowledge: original.knowledge,
      plugins: original.plugins,
      style: original.style,
      settings: original.settings,
      avatar_url: original.avatar_url,
      category: original.category,
      tags: original.tags,
      is_public: body.makePublic ?? false,
      is_template: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        character: clonedCharacter,
        message: "Character cloned successfully",
      },
    });
  } catch (error) {
    logger.error("[My Agents API] Error cloning character:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to clone character",
      },
      {
        status:
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500,
      },
    );
  }
}
