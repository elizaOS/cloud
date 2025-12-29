export function getElizaCloudApiUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

  if (
    appUrl?.includes("localhost") ||
    appUrl?.includes("127.0.0.1") ||
    process.env.NODE_ENV === "development"
  ) {
    return "http://localhost:3000/api/v1";
  }
  if (appUrl?.includes("dev.elizacloud.ai")) {
    return "https://www.dev.elizacloud.ai/api/v1";
  }
  return "https://www.elizacloud.ai/api/v1";
}

export function getDefaultModels() {
  return {
    small: process.env.ELIZAOS_CLOUD_SMALL_MODEL || "openai/gpt-4o-mini",
    large: process.env.ELIZAOS_CLOUD_LARGE_MODEL || "openai/gpt-4o",
    embedding:
      process.env.ELIZAOS_CLOUD_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

// Models verified to work with Vercel AI Gateway
export const ALLOWED_CHAT_MODELS = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4-turbo",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4",
  "anthropic/claude-3-5-sonnet-20241022",
  "google/gemini-2.0-flash",
  "google/gemini-1.5-pro",
  "google/gemini-1.5-flash",
] as const;

/**
 * ElevenLabs Settings Configuration
 * Centralized settings for TTS and STT to avoid duplication across modules
 */
export interface ElevenLabsSettings {
  // TTS Settings
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  ELEVENLABS_MODEL_ID: string;
  ELEVENLABS_VOICE_STABILITY: string;
  ELEVENLABS_VOICE_SIMILARITY_BOOST: string;
  ELEVENLABS_VOICE_STYLE: string;
  ELEVENLABS_VOICE_USE_SPEAKER_BOOST: string;
  ELEVENLABS_OPTIMIZE_STREAMING_LATENCY: string;
  ELEVENLABS_OUTPUT_FORMAT: string;
  ELEVENLABS_LANGUAGE_CODE: string;
  // STT Settings
  ELEVENLABS_STT_MODEL_ID: string;
  ELEVENLABS_STT_LANGUAGE_CODE: string;
  ELEVENLABS_STT_TIMESTAMPS_GRANULARITY: string;
  ELEVENLABS_STT_DIARIZE: string;
  ELEVENLABS_STT_NUM_SPEAKERS?: string;
  ELEVENLABS_STT_TAG_AUDIO_EVENTS: string;
}

/**
 * Build ElevenLabs settings from character settings with env fallbacks
 * @param charSettings - Character-specific settings
 * @returns Complete ElevenLabs configuration
 */
export function buildElevenLabsSettings(
  charSettings: Record<string, unknown> = {},
): ElevenLabsSettings {
  const getSetting = (key: string, fallback: string): string =>
    (charSettings[key] as string) || process.env[key] || fallback;

  const settings: ElevenLabsSettings = {
    // TTS
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
    ELEVENLABS_VOICE_ID: getSetting(
      "ELEVENLABS_VOICE_ID",
      "EXAVITQu4vr4xnSDxMaL",
    ),
    ELEVENLABS_MODEL_ID: getSetting(
      "ELEVENLABS_MODEL_ID",
      "eleven_multilingual_v2",
    ),
    ELEVENLABS_VOICE_STABILITY: getSetting("ELEVENLABS_VOICE_STABILITY", "0.5"),
    ELEVENLABS_VOICE_SIMILARITY_BOOST: getSetting(
      "ELEVENLABS_VOICE_SIMILARITY_BOOST",
      "0.75",
    ),
    ELEVENLABS_VOICE_STYLE: getSetting("ELEVENLABS_VOICE_STYLE", "0"),
    ELEVENLABS_VOICE_USE_SPEAKER_BOOST: getSetting(
      "ELEVENLABS_VOICE_USE_SPEAKER_BOOST",
      "true",
    ),
    ELEVENLABS_OPTIMIZE_STREAMING_LATENCY: getSetting(
      "ELEVENLABS_OPTIMIZE_STREAMING_LATENCY",
      "0",
    ),
    ELEVENLABS_OUTPUT_FORMAT: getSetting(
      "ELEVENLABS_OUTPUT_FORMAT",
      "mp3_44100_128",
    ),
    ELEVENLABS_LANGUAGE_CODE: getSetting("ELEVENLABS_LANGUAGE_CODE", "en"),
    // STT
    ELEVENLABS_STT_MODEL_ID: getSetting("ELEVENLABS_STT_MODEL_ID", "scribe_v1"),
    ELEVENLABS_STT_LANGUAGE_CODE: getSetting(
      "ELEVENLABS_STT_LANGUAGE_CODE",
      "en",
    ),
    ELEVENLABS_STT_TIMESTAMPS_GRANULARITY: getSetting(
      "ELEVENLABS_STT_TIMESTAMPS_GRANULARITY",
      "word",
    ),
    ELEVENLABS_STT_DIARIZE: getSetting("ELEVENLABS_STT_DIARIZE", "false"),
    ELEVENLABS_STT_TAG_AUDIO_EVENTS: getSetting(
      "ELEVENLABS_STT_TAG_AUDIO_EVENTS",
      "false",
    ),
  };

  // Optional: ELEVENLABS_STT_NUM_SPEAKERS
  const numSpeakers =
    charSettings.ELEVENLABS_STT_NUM_SPEAKERS ||
    process.env.ELEVENLABS_STT_NUM_SPEAKERS;
  if (numSpeakers) {
    settings.ELEVENLABS_STT_NUM_SPEAKERS = String(numSpeakers);
  }

  return settings;
}
