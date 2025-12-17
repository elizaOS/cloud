/**
 * Internal Discord TTS Endpoint
 *
 * POST /api/internal/discord/tts
 *
 * Generates TTS audio for text responses using agent's voice settings.
 * Used by gateway when agents respond with text to voice messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { discordGatewayService } from "@/lib/services/discord-gateway";
import { getElevenLabsService } from "@/lib/services/elevenlabs";
import { uploadToBlob } from "@/lib/blob";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTSSchema = z.object({
  connection_id: z.string().uuid(),
  text: z.string().min(1).max(5000),
  voice_id: z.string().optional(),
});

/**
 * Verify internal API key.
 */
function verifyInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    logger.error("[Discord TTS] INTERNAL_API_KEY not configured");
    return false;
  }

  return apiKey === expectedKey;
}

/**
 * POST /api/internal/discord/tts
 *
 * Generate TTS audio for a text response.
 */
export async function POST(request: NextRequest) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = TTSSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn("[Discord TTS] Invalid payload", {
      errors: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { connection_id, text, voice_id } = parsed.data;

  logger.info("[Discord TTS] Generating TTS", {
    connectionId: connection_id,
    textLength: text.length,
    voiceId: voice_id,
  });

  const connection = await discordGatewayService.getConnection(connection_id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  const elevenlabs = getElevenLabsService();
  let audioStream: ReadableStream<Uint8Array>;
  audioStream = await elevenlabs.textToSpeech({
    text,
    voiceId: voice_id,
  });

  const chunks: Uint8Array[] = [];
  const reader = audioStream.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  reader.releaseLock();

  if (chunks.length === 0) {
    logger.error("[Discord TTS] No audio data received from TTS service", {
      connectionId: connection_id,
    });
    return NextResponse.json(
      { error: "TTS generation produced no audio data" },
      { status: 500 },
    );
  }

  const audioBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  if (audioBuffer.length === 0) {
    logger.error("[Discord TTS] Generated audio buffer is empty", {
      connectionId: connection_id,
    });
    return NextResponse.json(
      { error: "Generated audio buffer is empty" },
      { status: 500 },
    );
  }

  logger.debug("[Discord TTS] Generated audio", {
    connectionId: connection_id,
    audioSize: audioBuffer.length,
  });

  const pathname = `discord-voice/tts/${connection_id}/${Date.now()}-tts.mp3`;

  const uploadResult = await uploadToBlob(audioBuffer, {
    filename: pathname,
    contentType: "audio/mpeg",
    folder: "",
  });

  logger.info("[Discord TTS] Uploaded audio to blob storage", {
    connectionId: connection_id,
    url: uploadResult.url,
    size: uploadResult.size,
  });

  return NextResponse.json({
    success: true,
    audio_url: uploadResult.url,
    size: uploadResult.size,
    content_type: uploadResult.contentType,
  });
}

