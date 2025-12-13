/**
 * Voice Plugin for ElizaOS
 * Integrates ElevenLabs TTS/STT with ElizaOS agents
 *
 * This plugin extends plugin-elevenlabs with additional STT functionality
 * and provides a unified voice interface for agents
 */

import type { Plugin } from "@elizaos/core";
import { speechToTextAction } from "./stt-action";
import { voiceProvider } from "./voice-provider";

export const voicePlugin: Plugin = {
  name: "@eliza-cloud/plugin-voice",
  description:
    "Provides speech-to-text and text-to-speech capabilities using ElevenLabs",

  actions: [speechToTextAction],
  providers: [voiceProvider],

  // No evaluators or services needed for now
  evaluators: [],
  services: [],
};

// Export individual components for flexibility
export { speechToTextAction } from "./stt-action";
export { voiceProvider, generateSpeech } from "./voice-provider";
export type {
  VoiceSettings,
  TranscriptionOptions,
  TranscriptionResult,
  SpeechGenerationOptions,
  SpeechGenerationResult,
} from "./types";

export default voicePlugin;
