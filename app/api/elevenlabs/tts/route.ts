import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { voiceCloningService } from "@/lib/services/voice-cloning";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { dbRead } from "@/db/client";
import { userVoices } from "@/db/schemas/user-voices";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { TTS_GENERATION_COST } from "@/lib/pricing-constants";

const MAX_TEXT_LENGTH = 5000;

/**
 * POST /api/elevenlabs/tts
 * Converts text to speech using ElevenLabs TTS API.
 * Supports custom user voices and tracks usage statistics.
 *
 * @param request - Request body with text, voiceId, and optional modelId.
 * @returns Streaming audio response (audio/mpeg).
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await requireAuthWithOrg();

    // Parse request body
    const body = await request.json();
    const { text, voiceId, modelId } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    if (text.length === 0) {
      return NextResponse.json(
        { error: "Text cannot be empty" },
        { status: 400 },
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: `Text too long. Maximum length is ${MAX_TEXT_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    logger.info(
      `[TTS API] Generating speech for user ${user.id}: ${text.length} chars`,
    );

    // Check credit balance
    if (Number(user.organization.credit_balance) < TTS_GENERATION_COST) {
      logger.warn("[TTS API] Insufficient credits", {
        organizationId: user.organization_id,
        required: TTS_GENERATION_COST,
        balance: user.organization.credit_balance,
      });
      return NextResponse.json(
        {
          error: "Insufficient balance",
          details: {
            required: TTS_GENERATION_COST,
            available: user.organization.credit_balance,
          },
        },
        { status: 402 },
      );
    }

    // Deduct credits BEFORE processing
    const deductionResult = await creditsService.deductCredits({
      organizationId: user.organization_id!!,
      amount: TTS_GENERATION_COST,
      description: `Text-to-Speech generation: ${text.length} characters`,
      metadata: {
        userId: user.id,
        textLength: text.length,
        voiceId: voiceId || "default",
      },
    });

    if (!deductionResult.success) {
      logger.error("[TTS API] Failed to deduct credits", {
        organizationId: user.organization_id!!,
        cost: TTS_GENERATION_COST,
      });
      return NextResponse.json(
        { error: "Failed to deduct credits. Please try again." },
        { status: 500 },
      );
    }

    logger.info("[TTS API] Credits deducted successfully", {
      organizationId: user.organization_id!!,
      amount: TTS_GENERATION_COST,
      newBalance: deductionResult.newBalance,
    });

    // Track custom voice usage (async, non-blocking)
    let userVoiceId: string | null = null;
    let voiceName: string | null = null;

    if (voiceId) {
      // Check if this is a custom user voice (not default ElevenLabs voice)
      const [voice] = await dbRead
        .select({
          id: userVoices.id,
          name: userVoices.name,
          organizationId: userVoices.organizationId,
        })
        .from(userVoices)
        .where(eq(userVoices.elevenlabsVoiceId, voiceId))
        .limit(1);

      if (voice && voice.organizationId === user.organization_id!) {
        userVoiceId = voice.id;
        voiceName = voice.name;

        // Increment voice usage count (fire-and-forget for zero latency)
        voiceCloningService.incrementUsageCount(voice.id).catch((err) =>
          logger.error("[TTS API] Failed to increment voice usage", {
            voiceId: voice.id,
            voiceName: voice.name,
            error: err instanceof Error ? err.message : String(err),
          }),
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
    let audioStream: ReadableStream<Uint8Array>;
    const startTime = Date.now();
    
    try {
      audioStream = await elevenlabs.textToSpeech({
        text,
        voiceId,
        modelId,
      });
    } catch (error) {
      // Refund credits on failure
      logger.error("[TTS API] Error generating speech, refunding credits", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      await creditsService.addCredits({
        organizationId: user.organization_id!!,
        amount: TTS_GENERATION_COST,
        description: `Refund for failed TTS generation`,
        metadata: {
          user_id: user.id,
          reason: "tts_generation_failed",
          originalError: error instanceof Error ? error.message : "Unknown",
        },
      });

      logger.info("[TTS API] Credits refunded", {
        organizationId: user.organization_id!!,
        amount: TTS_GENERATION_COST,
      });

      throw error; // Re-throw to be caught by outer catch block
    }
    
    const duration = Date.now() - startTime;

    logger.info(`[TTS API] Stream started in ${duration}ms`);

    // Track usage in usage_records table (background, non-blocking)
    (async () => {
      try {
        await usageService.create({
          organization_id: user.organization_id!!,
          user_id: user.id,
          api_key_id: null,
          type: "tts",
          model: modelId || "eleven_flash_v2_5",
          provider: "elevenlabs",
          input_tokens: Math.ceil(text.length / 4),
          output_tokens: 0,
          input_cost: String(TTS_GENERATION_COST),
          output_cost: String(0),
          duration_ms: duration,
          is_successful: true,
          metadata: {
            voiceId: voiceId || "default",
            userVoiceId: userVoiceId,
            voiceName: voiceName,
            textLength: text.length,
            characterCount: text.length,
            creditsDeducted: TTS_GENERATION_COST,
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
          { status: 429 },
        );
      }

      if (error.message.includes("quota")) {
        return NextResponse.json(
          {
            error:
              "Voice service is temporarily unavailable due to high demand. Please try again in a few moments.",
            type: "service_unavailable",
            retryAfter: "5 minutes",
          },
          { status: 503 }, // Service Unavailable (not 429 - makes it feel like platform issue)
        );
      }

      if (error.message.includes("voice")) {
        return NextResponse.json(
          { error: "Invalid voice ID. Please select a different voice." },
          { status: 400 },
        );
      }

      if (error.message.includes("ELEVENLABS_API_KEY")) {
        return NextResponse.json(
          { error: "Service not configured" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate speech. Please try again." },
      { status: 500 },
    );
  }
}
