import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { logger } from "@/lib/utils/logger";

export async function GET(_request: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuth();

    logger.info(`[Voices API] Fetching voices for user ${user.id}`);

    // Get ElevenLabs service
    const elevenlabs = getElevenLabsService();

    // Fetch voices
    const voices = await elevenlabs.getVoices();

    return NextResponse.json({
      voices,
    });

  } catch (error) {
    logger.error("[Voices API] Error:", error);

    if (error instanceof Error && error.message.includes("ELEVENLABS_API_KEY")) {
      return NextResponse.json(
        { error: "Service not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch voices. Please try again." },
      { status: 500 }
    );
  }
}
