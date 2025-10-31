/**
 * Voice Service Provider for ElizaOS
 * Provides voice generation and transcription services to agents
 */

import {
  type Provider,
  type IAgentRuntime,
  type ProviderResult,
} from "@elizaos/core";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type {
  VoiceSettings,
  SpeechGenerationOptions,
  SpeechGenerationResult,
} from "./types";

/**
 * Generate speech from text using ElevenLabs TTS
 */
async function generateSpeech(
  options: SpeechGenerationOptions,
  settings: VoiceSettings,
): Promise<SpeechGenerationResult> {
  const client = new ElevenLabsClient({ apiKey: settings.apiKey });

  const voiceId = options.voiceId || settings.voiceId || "EXAVITQu4vr4xnSDxMaL";
  const modelId =
    options.modelId || settings.modelId || "eleven_multilingual_v2";

  const voiceSettings = {
    stability: options.voiceSettings?.stability ?? settings.stability ?? 0.5,
    similarity_boost:
      options.voiceSettings?.similarityBoost ??
      settings.similarityBoost ??
      0.75,
    style: options.voiceSettings?.style ?? settings.style ?? 0,
    use_speaker_boost:
      options.voiceSettings?.useSpeakerBoost ??
      settings.useSpeakerBoost ??
      true,
  };

  const audioStream = await client.textToSpeech.convert(voiceId, {
    text: options.text,
    modelId: modelId,
    voiceSettings: voiceSettings,
    optimizeStreamingLatency: settings.optimizeStreamingLatency ?? 0,
    outputFormat: (options.outputFormat ||
      settings.outputFormat ||
      "mp3_44100_128") as unknown as Parameters<
      typeof client.textToSpeech.convert
    >[1]["outputFormat"],
  });

  // Convert ReadableStream to buffer
  const chunks: Uint8Array[] = [];
  const reader = audioStream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const audioBuffer = Buffer.concat(chunks);

  return {
    audio: audioBuffer,
    contentType: options.outputFormat?.startsWith("mp3")
      ? "audio/mpeg"
      : "audio/wav",
    size: audioBuffer.length,
  };
}

/**
 * Voice Service Provider
 * Provides TTS functionality to agents via the provider system
 */
export const voiceProvider: Provider = {
  name: "voice",
  description: "Provides voice generation and transcription capabilities",
  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    try {
      // Check if voice generation is available
      const settings: VoiceSettings = {
        apiKey: String(
          runtime.character?.settings?.ELEVENLABS_API_KEY ||
            process.env.ELEVENLABS_API_KEY ||
            "",
        ),
        voiceId: runtime.character?.settings?.ELEVENLABS_VOICE_ID
          ? String(runtime.character.settings.ELEVENLABS_VOICE_ID)
          : undefined,
        modelId: runtime.character?.settings?.ELEVENLABS_MODEL_ID
          ? String(runtime.character.settings.ELEVENLABS_MODEL_ID)
          : undefined,
      };

      if (!settings.apiKey) {
        return { text: "Voice generation is not configured for this agent." };
      }

      // Provide context about voice capabilities
      const voiceName = settings.voiceId || "default voice";
      const context = [
        "Voice Generation Available:",
        `- Voice: ${voiceName}`,
        `- Model: ${settings.modelId || "eleven_multilingual_v2"}`,
        "- Can generate speech from text responses",
        "- Can transcribe voice messages from users",
      ].join("\n");

      return { text: context };
    } catch (error) {
      console.error("[Voice Provider] Error:", error);
      return { text: "" };
    }
  },
};

/**
 * Helper function to generate speech (can be used by other actions)
 */
export { generateSpeech };

export default voiceProvider;
