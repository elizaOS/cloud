/**
 * Speech-to-Text Action for ElizaOS
 * Provides STT functionality using ElevenLabs API
 */

import {
  type Action,
  type State,
  type HandlerCallback,
  ContentType,
} from "@elizaos/core";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type {
  TranscriptionOptions,
  TranscriptionResult,
  VoiceSettings,
} from "./types";

/**
 * Transcribe audio to text using ElevenLabs STT
 */
async function transcribeAudio(
  options: TranscriptionOptions,
  settings: VoiceSettings,
): Promise<TranscriptionResult> {
  const client = new ElevenLabsClient({ apiKey: settings.apiKey });

  const modelId = options.modelId || "scribe_v1";

  const result = await client.speechToText.convert({
    file: options.audioFile as File,
    modelId,
    languageCode: options.languageCode || settings.languageCode,
  });

  // Handle response type (single channel or multi-channel)
  let transcript = "";
  let languageCode: string | undefined;

  if ("text" in result) {
    transcript = result.text || "";
    const resultWithLangCode = result as {
      text?: string;
      languageCode?: string;
      language_code?: string;
    };
    languageCode =
      resultWithLangCode.languageCode || resultWithLangCode.language_code;
  } else if ("transcripts" in result) {
    const transcripts = result.transcripts || {};
    transcript = Object.values(transcripts)
      .map((t: { text?: string }) => t?.text || "")
      .filter(Boolean)
      .join(" ");
  }

  return {
    transcript,
    languageCode,
  };
}

/**
 * STT Action for ElizaOS
 * Allows agents to process voice input
 */
export const speechToTextAction: Action = {
  name: "TRANSCRIBE_AUDIO",
  description: "Transcribe audio input to text using speech recognition",

  similes: [
    "SPEECH_TO_TEXT",
    "VOICE_TO_TEXT",
    "TRANSCRIBE",
    "RECOGNIZE_SPEECH",
  ],

  validate: async (runtime, message) => {
    // Check if message contains audio attachment
    if (
      !message.content?.attachments ||
      message.content.attachments.length === 0
    ) {
      return false;
    }

    // Check if any attachment is audio
    const hasAudioAttachment = message.content.attachments.some((att) =>
      att.contentType?.startsWith("audio/"),
    );

    if (!hasAudioAttachment) {
      return false;
    }

    // Check if ElevenLabs API key is configured
    const settings = runtime.character?.settings;
    const apiKey =
      settings?.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;

    return !!apiKey;
  },

  handler: async (
    runtime,
    message,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<void> => {
    try {
      // Get voice settings from character config
      const settings: VoiceSettings = {
        apiKey: String(
          runtime.character?.settings?.ELEVENLABS_API_KEY ||
            process.env.ELEVENLABS_API_KEY ||
            "",
        ),
        languageCode: runtime.character?.settings?.ELEVENLABS_LANGUAGE_CODE
          ? String(runtime.character.settings.ELEVENLABS_LANGUAGE_CODE)
          : undefined,
      };

      // Find audio attachment
      const audioAttachment = message.content?.attachments?.find((att) =>
        att.contentType?.startsWith("audio/"),
      );

      if (!audioAttachment) {
        console.error("[STT Action] No audio attachment found");
        return;
      }

      // Fetch audio file
      let audioBlob: Blob;
      if (audioAttachment.url) {
        const response = await fetch(audioAttachment.url);
        audioBlob = await response.blob();
      } else {
        console.error("[STT Action] Audio attachment has no URL");
        return;
      }

      // Transcribe audio
      const result = await transcribeAudio(
        {
          audioFile: audioBlob,
          languageCode: settings.languageCode,
        },
        settings,
      );

      if (!result.transcript) {
        console.warn("[STT Action] No transcript generated");
        return;
      }

      // Update message with transcribed text
      if (callback) {
        await callback({
          text: result.transcript,
          action: "TRANSCRIBE_AUDIO",
          content: {
            text: result.transcript,
            source: "voice",
            attachments: [
              {
                ...audioAttachment,
                description: `Transcribed: ${result.transcript}`,
                text: result.transcript,
              },
            ],
          },
        });
      }

      return;
    } catch (error) {
      console.error("[STT Action] Error:", error);
      return;
    }
  },

  examples: [
    [
      {
        name: "User",
        content: {
          text: "",
          attachments: [
            {
              id: "audio-1",
              url: "https://example.com/audio.mp3",
              contentType: ContentType.AUDIO,
            },
          ],
        },
      },
      {
        name: "Agent",
        content: {
          text: "I heard you say: Hello, how are you today?",
          action: "TRANSCRIBE_AUDIO",
        },
      },
    ],
  ],
};

export default speechToTextAction;
