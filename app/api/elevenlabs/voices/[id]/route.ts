import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { voiceCloningService } from "@/lib/services/voice-cloning";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const params = await context.params;
    const voiceId = params.id;

    logger.info(`[Voice API] Getting voice ${voiceId} for user ${user.id}`);

    const voice = await voiceCloningService.getVoiceById(
      voiceId,
      user.organization_id
    );

    if (!voice) {
      return NextResponse.json({ error: "Voice not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      voice,
    });
  } catch (error) {
    logger.error("[Voice API] Error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch voice. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const params = await context.params;
    const voiceId = params.id;

    logger.info(`[Voice API] Deleting voice ${voiceId} for user ${user.id}`);

    await voiceCloningService.deleteVoice(voiceId, user.organization_id);

    return NextResponse.json({
      success: true,
      message: "Voice deleted successfully",
    });
  } catch (error) {
    logger.error("[Voice API] Delete error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }

      if (error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return NextResponse.json(
      { error: "Failed to delete voice. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const params = await context.params;
    const voiceId = params.id;
    const body = await request.json();

    logger.info(`[Voice API] Updating voice ${voiceId} for user ${user.id}`);

    const { name, description, settings, isActive } = body;

    const updatedVoice = await voiceCloningService.updateVoice(
      voiceId,
      user.organization_id,
      {
        name,
        description,
        settings,
        isActive,
      }
    );

    return NextResponse.json({
      success: true,
      voice: updatedVoice,
    });
  } catch (error) {
    logger.error("[Voice API] Update error:", error);

    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }

      if (error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return NextResponse.json(
      { error: "Failed to update voice. Please try again." },
      { status: 500 }
    );
  }
}
