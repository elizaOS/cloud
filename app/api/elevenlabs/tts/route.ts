import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { voiceCloningService, usageService } from "@/lib/services";
import { db } from "@/db/client";
import { userVoices } from "@/db/schemas/user-voices";
import { eq } from "drizzle-orm";
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
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    if (text.length === 0) {
      return NextResponse.json(
        { error: "Text cannot be empty" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: `Text too long. Maximum length is ${MAX_TEXT_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    logger.info(
      `[TTS API] Generating speech for user ${user.id}: ${text.length} chars`
    );

    // Track custom voice usage (async, non-blocking)
    let userVoiceId: string | null = null;
    let voiceName: string | null = null;

    if (voiceId) {
      // Check if this is a custom user voice (not default ElevenLabs voice)
      const [voice] = await db
        .select({
          id: userVoices.id,
          name: userVoices.name,
          organizationId: userVoices.organizationId,
        })
        .from(userVoices)
        .where(eq(userVoices.elevenlabsVoiceId, voiceId))
        .limit(1);

      if (voice && voice.organizationId === user.organization_id) {
        userVoiceId = voice.id;
        voiceName = voice.name;

        // Increment voice usage count (fire-and-forget for zero latency)
        voiceCloningService.incrementUsageCount(voice.id).catch((err) =>
          logger.error("[TTS API] Failed to increment voice usage", {
            voiceId: voice.id,
            voiceName: voice.name,
            error: err instanceof Error ? err.message : String(err),
          })
        );

        logger.info("[TTS API] Tracking custom voice usage", {
          userVoiceId: voice.id,
          voiceName: voice.name,
        });
      }
    }

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

    // Track usage in usage_records table (background, non-blocking)
    // This follows the same pattern as other APIs in the codebase for analytics
    (async () => {
      try {
        await usageService.create({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: null, // TTS doesn't use API keys currently
          type: "tts",
          model: modelId || "eleven_flash_v2_5",
          provider: "elevenlabs",
          input_tokens: Math.ceil(text.length / 4), // Approximate character to token conversion
          output_tokens: 0,
          input_cost: 0, // Free for now, can add pricing later
          output_cost: 0,
          duration_ms: duration,
          is_successful: true,
          metadata: {
            voiceId: voiceId || "default",
            userVoiceId: userVoiceId,
            voiceName: voiceName,
            textLength: text.length,
            characterCount: text.length,
          },
        });

        logger.debug("[TTS API] Usage record created successfully", {
          userVoiceId,
          textLength: text.length,
        });
      } catch (error) {
        logger.error("[TTS API] Failed to create usage record", {
          error: error instanceof Error ? error.message : String(error),
          userVoiceId,
        });
      }
    })();

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
          { 
            error: "Voice service is temporarily unavailable due to high demand. Please try again in a few moments.",
            type: "service_unavailable",
            retryAfter: "5 minutes"
          },
          { status: 503 } // Service Unavailable (not 429 - makes it feel like platform issue)
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
