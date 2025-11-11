import type { Character, Plugin } from "@elizaos/core";
import { elizaOSCloudPlugin } from "@elizaos/plugin-elizacloud";
import { elevenLabsPlugin } from "@elizaos/plugin-elevenlabs";
import { assistantPlugin } from "./plugin-assistant";
import { charactersService } from "@/lib/services/characters";
import type { ElizaCharacter } from "@/lib/types";
import defaultAgent from "./agent";
import { getElizaCloudApiUrl, getDefaultModels } from "./config";

/**
 * Maps plugin names to their implementations
 * Add new plugins here as they are integrated
 * Note: Type assertions needed due to ElizaOS plugin type bundling differences
 */
const AVAILABLE_PLUGINS: Record<string, Plugin> = {
  "@elizaos/plugin-elizacloud": elizaOSCloudPlugin as unknown as Plugin,
  "@elizaos/plugin-elevenlabs": elevenLabsPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-assistant": assistantPlugin as unknown as Plugin,
};

/**
 * Character loader service for dynamic character loading
 * Handles plugin resolution, settings merging, and ElizaOS Character format conversion
 */
export class CharacterLoader {
  /**
   * Load character by ID from database and prepare for ElizaOS runtime
   */
  async loadCharacter(characterId: string): Promise<{
    character: Character;
    plugins: Plugin[];
  }> {
    // Load character from database
    const dbCharacter = await charactersService.getById(characterId);

    if (!dbCharacter) {
      throw new Error(`Character not found: ${characterId}`);
    }

    // Convert to ElizaOS format
    const elizaCharacter = charactersService.toElizaCharacter(dbCharacter);

    // Build full character with environment settings
    const character = this.buildCharacter(elizaCharacter);

    // Resolve plugins
    const plugins = this.resolvePlugins(elizaCharacter.plugins || []);

    return { character, plugins };
  }

  /**
   * Get the default character (from lib/eliza/agent.ts)
   * Note: This method is async to support lazy-loaded plugins
   */
  async getDefaultCharacter(): Promise<{
    character: Character;
    plugins: Plugin[];
  }> {
    const plugins = await defaultAgent.getPlugins();
    return {
      character: defaultAgent.character,
      plugins: plugins as unknown as Plugin[],
    };
  }

  /**
   * Build Character object with proper settings merging
   * IMPORTANT: Always uses the default agent ID for database consistency
   */
  private buildCharacter(elizaCharacter: ElizaCharacter): Character {
    // CRITICAL: Use the same agent ID as default Eliza for database operations
    // Different characters share the same agent ID to avoid database conflicts
    const ELIZA_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";
    // Merge environment variables with character settings
    const settings = {
      // Database URLs (always from environment)
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,

      // ElizaOS Cloud Configuration (replaces OpenAI)
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELIZAOS_CLOUD_SMALL_MODEL:
        (elizaCharacter.settings?.ELIZAOS_CLOUD_SMALL_MODEL as string) ||
        getDefaultModels().small,
      ELIZAOS_CLOUD_LARGE_MODEL:
        (elizaCharacter.settings?.ELIZAOS_CLOUD_LARGE_MODEL as string) ||
        getDefaultModels().large,
      // Note: ELIZAOS_CLOUD_API_KEY will be set at runtime with user's auto-generated key

      // ElevenLabs settings (merge character settings with environment)
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
      ELEVENLABS_VOICE_ID:
        (elizaCharacter.settings?.ELEVENLABS_VOICE_ID as string) ||
        process.env.ELEVENLABS_VOICE_ID ||
        "EXAVITQu4vr4xnSDxMaL",
      ELEVENLABS_MODEL_ID:
        (elizaCharacter.settings?.ELEVENLABS_MODEL_ID as string) ||
        process.env.ELEVENLABS_MODEL_ID ||
        "eleven_multilingual_v2",
      ELEVENLABS_VOICE_STABILITY:
        (elizaCharacter.settings?.ELEVENLABS_VOICE_STABILITY as string) ||
        process.env.ELEVENLABS_VOICE_STABILITY ||
        "0.5",
      ELEVENLABS_VOICE_SIMILARITY_BOOST:
        (elizaCharacter.settings
          ?.ELEVENLABS_VOICE_SIMILARITY_BOOST as string) ||
        process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ||
        "0.75",
      ELEVENLABS_VOICE_STYLE:
        (elizaCharacter.settings?.ELEVENLABS_VOICE_STYLE as string) ||
        process.env.ELEVENLABS_VOICE_STYLE ||
        "0",
      ELEVENLABS_VOICE_USE_SPEAKER_BOOST:
        (elizaCharacter.settings
          ?.ELEVENLABS_VOICE_USE_SPEAKER_BOOST as string) ||
        process.env.ELEVENLABS_VOICE_USE_SPEAKER_BOOST ||
        "true",
      ELEVENLABS_OPTIMIZE_STREAMING_LATENCY:
        (elizaCharacter.settings
          ?.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY as string) ||
        process.env.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY ||
        "0",
      ELEVENLABS_OUTPUT_FORMAT:
        (elizaCharacter.settings?.ELEVENLABS_OUTPUT_FORMAT as string) ||
        process.env.ELEVENLABS_OUTPUT_FORMAT ||
        "mp3_44100_128",
      ELEVENLABS_LANGUAGE_CODE:
        (elizaCharacter.settings?.ELEVENLABS_LANGUAGE_CODE as string) ||
        process.env.ELEVENLABS_LANGUAGE_CODE ||
        "en",

      // ElevenLabs STT settings
      ELEVENLABS_STT_MODEL_ID:
        (elizaCharacter.settings?.ELEVENLABS_STT_MODEL_ID as string) ||
        process.env.ELEVENLABS_STT_MODEL_ID ||
        "scribe_v1",
      ELEVENLABS_STT_LANGUAGE_CODE:
        (elizaCharacter.settings?.ELEVENLABS_STT_LANGUAGE_CODE as string) ||
        process.env.ELEVENLABS_STT_LANGUAGE_CODE ||
        "en",
      ELEVENLABS_STT_TIMESTAMPS_GRANULARITY:
        (elizaCharacter.settings
          ?.ELEVENLABS_STT_TIMESTAMPS_GRANULARITY as string) ||
        process.env.ELEVENLABS_STT_TIMESTAMPS_GRANULARITY ||
        "word",
      ELEVENLABS_STT_DIARIZE:
        (elizaCharacter.settings?.ELEVENLABS_STT_DIARIZE as string) ||
        process.env.ELEVENLABS_STT_DIARIZE ||
        "false",
      ...(elizaCharacter.settings?.ELEVENLABS_STT_NUM_SPEAKERS ||
      process.env.ELEVENLABS_STT_NUM_SPEAKERS
        ? {
            ELEVENLABS_STT_NUM_SPEAKERS:
              elizaCharacter.settings?.ELEVENLABS_STT_NUM_SPEAKERS ||
              process.env.ELEVENLABS_STT_NUM_SPEAKERS,
          }
        : {}),
      ELEVENLABS_STT_TAG_AUDIO_EVENTS:
        (elizaCharacter.settings?.ELEVENLABS_STT_TAG_AUDIO_EVENTS as string) ||
        process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS ||
        "false",

      // Merge any other custom settings from character
      ...elizaCharacter.settings,
    };

    // Build Character object
    // Use consistent agent ID for database operations, character name for personality
    const character: Character = {
      id: ELIZA_AGENT_ID as `${string}-${string}-${string}-${string}-${string}`,
      name: elizaCharacter.name,
      username: elizaCharacter.username,
      plugins: elizaCharacter.plugins || [],
      settings,
      system: elizaCharacter.system,
      bio: elizaCharacter.bio,
      messageExamples: elizaCharacter.messageExamples,
      postExamples: elizaCharacter.postExamples,
      topics: elizaCharacter.topics,
      adjectives: elizaCharacter.adjectives,
      knowledge: elizaCharacter.knowledge,
      style: elizaCharacter.style,
      templates: elizaCharacter.templates,
    };

    return character;
  }

  /**
   * Resolve plugin names to plugin instances
   * Handles special cases like ElevenLabs and returns providers/actions
   */
  private resolvePlugins(pluginNames: string[]): Plugin[] {
    const plugins: unknown[] = [];

    // Always include ElizaCloud for LLM (required)
    if (!plugins.some((p) => p === elizaOSCloudPlugin)) {
      plugins.push(elizaOSCloudPlugin);
    }

    // Always include assistant plugin (provides context)
    if (!plugins.some((p) => p === assistantPlugin)) {
      plugins.push(assistantPlugin);
    }

    // Resolve character-specified plugins
    for (const pluginName of pluginNames) {
      const plugin = AVAILABLE_PLUGINS[pluginName];

      if (plugin) {
        // Avoid duplicates
        if (!plugins.some((p) => p === plugin)) {
          plugins.push(plugin);
        }
      } else {
        console.warn(`[CharacterLoader] Unknown plugin: ${pluginName}`);
      }
    }

    return plugins as Plugin[];
  }

  /**
   * Get providers and actions from plugins
   */
  getProvidersAndActions(plugins: Plugin[]): {
    providers: unknown[];
    actions: unknown[];
  } {
    const providers = plugins
      .map((plugin) => plugin.providers || [])
      .flat()
      .filter(Boolean);

    const actions = plugins
      .map((plugin) => plugin.actions || [])
      .flat()
      .filter(Boolean);

    return { providers, actions };
  }
}

// Export singleton instance
export const characterLoader = new CharacterLoader();
