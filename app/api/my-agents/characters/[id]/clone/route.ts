import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { myAgentsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

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

    const clonedCharacter = await myAgentsService.cloneCharacter(
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
