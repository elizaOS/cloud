import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { marketplaceService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/characters/[id]/clone
 * Clones a marketplace character to the user's organization.
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

    logger.info("[Marketplace API] Cloning character:", {
      characterId: id,
      userId: user.id,
      name: body.name,
    });

    const clonedCharacter = await marketplaceService.cloneCharacter(
      id,
      user.id,
      user.organization_id!,
      {
        name: body.name,
        makePublic: body.makePublic,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        character: clonedCharacter,
        message: "Character cloned successfully",
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error cloning character:", error);

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
