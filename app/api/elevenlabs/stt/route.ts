import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { logger } from "@/lib/utils/logger";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const SUPPORTED_MIME_TYPES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
];

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuth();

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const languageCode = formData.get("languageCode") as string | undefined;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate MIME type (check base type without codec parameters)
    const baseMimeType = audioFile.type.split(";")[0].trim();
    if (!SUPPORTED_MIME_TYPES.includes(baseMimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported audio format: ${audioFile.type}. Supported: mp3, mp4, m4a, wav, webm, ogg`
        },
        { status: 400 }
      );
    }

    logger.info(`[STT API] Processing for user ${user.id}: ${audioFile.name} (${audioFile.size} bytes)`);

    // Get ElevenLabs service
    const elevenlabs = getElevenLabsService();

    // Transcribe audio
    const startTime = Date.now();
    const transcript = await elevenlabs.speechToText({
      audioFile,
      languageCode,
    });
    const duration = Date.now() - startTime;

    logger.info(`[STT API] Completed in ${duration}ms: "${transcript.substring(0, 100)}..."`);

    return NextResponse.json({
      transcript,
      duration_ms: duration,
    });

  } catch (error) {
    logger.error("[STT API] Error:", error);

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorBody = (error as any).body?.detail?.message || "";

      if (errorMessage.includes("rate limit")) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again in a moment." },
          { status: 429 }
        );
      }

      if (errorMessage.includes("quota") || (error as any).statusCode === 403) {
        if (errorBody.includes("enterprise") || errorBody.includes("trial tier") || errorBody.includes("ZRM mode")) {
          return NextResponse.json(
            {
              error: "Speech-to-Text requires a paid ElevenLabs plan (Starter tier or higher). The free tier does not support STT API access. Please upgrade at https://elevenlabs.io/pricing"
            },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: "Service quota exceeded. Please contact support." },
          { status: 429 }
        );
      }

      if (errorMessage.includes("elevenlabs_api_key")) {
        return NextResponse.json(
          { error: "Service not configured" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to transcribe audio. Please try again." },
      { status: 500 }
    );
  }
}
