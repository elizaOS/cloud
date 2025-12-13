/**
 * Voice plugin types for ElizaOS
 * Provides type-safe interfaces for TTS and STT operations
 */

import type { Memory, State } from "@elizaos/core";

export interface VoiceSettings {
  // ElevenLabs API Configuration
  apiKey: string;

  // Voice Configuration
  voiceId?: string;
  modelId?: string;

  // Voice Quality Settings
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;

  // Technical Settings
  optimizeStreamingLatency?: number;
  outputFormat?: string;

  // STT Settings
  languageCode?: string;
}

export interface TranscriptionOptions {
  audioFile: File | Blob;
  modelId?: string;
  languageCode?: string;
}

export interface TranscriptionResult {
  transcript: string;
  languageCode?: string;
  duration?: number;
}

export interface SpeechGenerationOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  outputFormat?: string;
}

export interface SpeechGenerationResult {
  audio: Buffer | Blob;
  contentType: string;
  size: number;
}

export interface VoiceActionContext {
  memory: Memory;
  state?: State;
  settings: VoiceSettings;
}
