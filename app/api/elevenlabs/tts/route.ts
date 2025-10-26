import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { logger } from "@/lib/utils/logger";

const MAX_TEXT_LENGTH = 5000;

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuth();

    // Parse request body
    const body = await request.json();
    const { text, voiceId, modelId } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    if (text.length === 0) {
      return NextResponse.json(
        { error: "Text cannot be empty" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text too long. Maximum length is ${MAX_TEXT_LENGTH} characters` },
        { status: 400 }
      );
    }

    logger.info(`[TTS API] Generating speech for user ${user.id}: ${text.length} chars`);

    // Get ElevenLabs service
    const elevenlabs = getElevenLabsService();

    // Generate speech
    const startTime = Date.now();
    const audioStream = await elevenlabs.textToSpeech({
      text,
      voiceId,
      modelId,
    });
    const duration = Date.now() - startTime;

    logger.info(`[TTS API] Stream started in ${duration}ms`);

    // Return streaming audio response
    return new NextResponse(audioStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });

  } catch (error) {
    logger.error("[TTS API] Error:", error);

    if (error instanceof Error) {
      if (error.message.includes("rate limit")) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again in a moment." },
          { status: 429 }
        );
      }

      if (error.message.includes("quota")) {
        return NextResponse.json(
          { error: "Service quota exceeded. Please contact support." },
          { status: 429 }
        );
      }

      if (error.message.includes("voice")) {
        return NextResponse.json(
          { error: "Invalid voice ID. Please select a different voice." },
          { status: 400 }
        );
      }

      if (error.message.includes("ELEVENLABS_API_KEY")) {
        return NextResponse.json(
          { error: "Service not configured" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate speech. Please try again." },
      { status: 500 }
    );
  }
}
