import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/characters/[id]/clone
 * 
 * @deprecated Use /api/my-agents/characters/[id]/clone instead.
 * This endpoint is maintained for backwards compatibility.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const clonedCharacter = await characterMarketplaceService.cloneCharacter(
    id,
    user.id,
    user.organization_id!,
    { name: body.name, makePublic: body.makePublic },
  );

  return NextResponse.json({
    success: true,
    data: {
      character: clonedCharacter,
      message: "Character cloned successfully",
    },
  });
}
