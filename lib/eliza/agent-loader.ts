import type { Character, Plugin } from "@elizaos/core";
import { elizaOSCloudPlugin } from "@elizaos/plugin-elizacloud";
import { memoryPlugin } from "@elizaos/plugin-memory";
import { elevenLabsPlugin } from "@elizaos/plugin-elevenlabs";
// Now using local plugin-mcp v1.3.1 with async initialization fix
import mcpPlugin from "@elizaos/plugin-mcp";
import { assistantPlugin } from "./plugin-assistant";
import { chatPlaygroundPlugin } from "./plugin-chat-playground";
import { characterBuilderPlugin } from "./plugin-character-builder";
import { charactersService } from "@/lib/services/characters";
import type { ElizaCharacter } from "@/lib/types";
import defaultAgent from "./agent";
import { getElizaCloudApiUrl } from "./config";
import { AgentMode, AGENT_MODE_PLUGINS } from "./agent-mode-types";

/**
 * Lazy-load the knowledge plugin to avoid SSR issues with pdfjs-dist
 * This prevents DOMMatrix errors when pages are server-rendered
 */
async function loadKnowledgePlugin() {
  const { knowledgePluginCore } = await import("@elizaos/plugin-knowledge");
  return knowledgePluginCore;
}

/**
 * Maps plugin names to their implementations
 * Core plugins are selected based on AgentMode
 * Additional plugins can be enabled per-character
 * Type assertions needed due to ElizaOS plugin type bundling differences
 */
const AVAILABLE_PLUGINS: Record<string, Plugin> = {
  "@elizaos/plugin-elizacloud": elizaOSCloudPlugin as unknown as Plugin,
  "@elizaos/plugin-elevenlabs": elevenLabsPlugin as unknown as Plugin,
  "@elizaos/plugin-memory": memoryPlugin as unknown as Plugin,
  "@elizaos/plugin-mcp": mcpPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-assistant": assistantPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-chat-playground":
    chatPlaygroundPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-character-builder":
    characterBuilderPlugin as unknown as Plugin,
};

/**
 * Agent loader service for dynamic agent configuration
 * Handles plugin resolution based on AgentMode, settings merging, and ElizaOS Character format conversion
 */
export class AgentLoader {
  /**
   * Load character by ID and configure for specified AgentMode
   */
  async loadCharacter(
    characterId: string,
    agentMode: AgentMode
  ): Promise<{
    character: Character;
    plugins: Plugin[];
  }> {
    // Load character from database
    const dbCharacter = await charactersService.getById(characterId);

    if (!dbCharacter) {
      console.error(`[AgentLoader] Character not found: ${characterId}`);
      throw new Error(`Character not found: ${characterId}`);
    }

    // Convert to ElizaOS format
    const elizaCharacter = charactersService.toElizaCharacter(dbCharacter);

    // Build full character with environment settings
    const character = this.buildCharacter(elizaCharacter);

    // Auto-switch to ASSISTANT mode if character has plugin-mcp
    // This ensures the assistant plugin is loaded alongside MCP support
    let effectiveAgentMode = agentMode;
    if (
      (elizaCharacter.plugins || []).includes("@elizaos/plugin-mcp") &&
      agentMode !== AgentMode.ASSISTANT
    ) {
      console.log(
        `[AgentLoader] Character has plugin-mcp, switching from ${agentMode} to ${AgentMode.ASSISTANT} mode`,
      );
      effectiveAgentMode = AgentMode.ASSISTANT;
    }

    // Resolve plugins based on AgentMode + character-specific plugins
    const plugins = await this.resolvePlugins(
      effectiveAgentMode,
      elizaCharacter.plugins || [],
    );

    return { character, plugins };
  }

  /**
   * Get the default character configured for specified AgentMode
   * Note: This method is async to support lazy-loaded plugins
   */
  async getDefaultCharacter(agentMode: AgentMode): Promise<{
    character: Character;
    plugins: Plugin[];
  }> {
    // Get plugins for the specified mode
    const plugins = await this.resolvePlugins(agentMode, []);

    return {
      character: defaultAgent.character,
      plugins: plugins as unknown as Plugin[],
    };
  }

  /**
   * Build Character object with proper settings merging
   * Uses the character's own ID from the database
   */
  private buildCharacter(elizaCharacter: ElizaCharacter): Character {
    // Use the character's database ID, or fallback to default Eliza ID
    const characterId =
      elizaCharacter.id || "b850bc30-45f8-0041-a00a-83df46d8555d";

    // Merge environment variables with character settings
    // NOTE: Model selection (ELIZAOS_CLOUD_SMALL_MODEL, ELIZAOS_CLOUD_LARGE_MODEL) is
    // handled in RuntimeFactory.buildSettings() where we have access to userContext.modelPreferences
    // This allows users to select models from the UI dropdown
    const settings: Record<string, any> = {
      // Database URLs (always from environment)
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,

      // ElizaOS Cloud Configuration (base URL only - models set in RuntimeFactory)
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      // Note: ELIZAOS_CLOUD_API_KEY and model settings will be set at runtime with user context

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

      // Avatar URL from character
      avatarUrl: elizaCharacter.avatarUrl || elizaCharacter.avatar_url,

      // Merge any other custom settings from character
      ...elizaCharacter.settings,
    };

    // Debug: Log affiliate data in settings
    if (settings.affiliateData) {
      console.log(
        `[AgentLoader] 🔍 Character "${elizaCharacter.name}" has affiliateData:`,
        JSON.stringify(settings.affiliateData, null, 2).substring(0, 500),
      );
    } else {
      console.log(
        `[AgentLoader] ⚠️ Character "${elizaCharacter.name}" has NO affiliateData in settings`,
      );
      console.log(
        `[AgentLoader] elizaCharacter.settings keys:`,
        elizaCharacter.settings ? Object.keys(elizaCharacter.settings) : "none",
      );
    }

    // Build Character object
    // Use the character's own ID for proper database isolation
    const character: Character = {
      id: characterId as `${string}-${string}-${string}-${string}-${string}`,
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
   * Resolve plugins based on AgentMode and character-specific plugins
   *
   * AGENT MODE PLUGIN SETS:
   *
   * CHAT mode:
   * - @elizaos/plugin-elizacloud (LLM provider)
   * - @eliza-cloud/plugin-chat-playground (simple chat handler)
   * - @elizaos/plugin-memory (conversation memory)
   *
   * BUILD mode:
   * - @elizaos/plugin-elizacloud (LLM provider)
   * - @eliza-cloud/plugin-character-builder (character editing)
   * - @elizaos/plugin-memory (conversation memory)
   *
   * ASSISTANT mode:
   * - @elizaos/plugin-elizacloud (LLM provider)
   * - @eliza-cloud/plugin-assistant (planning + actions)
   * - @elizaos/plugin-memory (conversation memory)
   * - @elizaos/plugin-knowledge (RAG + document processing)
   *
   * CHARACTER-SPECIFIC PLUGINS (added on top of mode plugins):
   * - @elizaos/plugin-elevenlabs (if specified in character.plugins)
   * - Any other plugins specified in character configuration
   */
  private async resolvePlugins(
    agentMode: AgentMode,
    characterPlugins: string[]
  ): Promise<Plugin[]> {
    const plugins: unknown[] = [];

    // ========================================
    // CORE PLUGINS - BASED ON AGENT MODE
    // ========================================

    const corePluginNames = AGENT_MODE_PLUGINS[agentMode];

    console.log(
      `[AgentLoader] Loading plugins for ${agentMode} mode:`,
      corePluginNames
    );

    for (const pluginName of corePluginNames) {
      // Special handling for knowledge plugin (lazy-loaded for SSR)
      if (pluginName === "@elizaos/plugin-knowledge") {
        const knowledgePlugin = await loadKnowledgePlugin();
        if (!plugins.some((p) => p === knowledgePlugin)) {
          plugins.push(knowledgePlugin);
          console.log(`[AgentLoader] ✓ Loaded: ${pluginName} (lazy-loaded)`);
        }
        continue;
      }

      // Load other plugins from available plugins map
      const plugin = AVAILABLE_PLUGINS[pluginName];
      if (plugin) {
        if (!plugins.some((p) => p === plugin)) {
          plugins.push(plugin);
          console.log(`[AgentLoader] ✓ Loaded: ${pluginName}`);
        }
      } else {
        console.warn(`[AgentLoader] ⚠ Core plugin not found: ${pluginName}`);
      }
    }

    // ========================================
    // CHARACTER-SPECIFIC PLUGINS (OPTIONAL)
    // ========================================

    // Resolve additional plugins specified in character configuration
    for (const pluginName of characterPlugins) {
      // Special handling for lazy-loaded plugins
      if (pluginName === "@elizaos/plugin-knowledge") {
        const knowledgePlugin = await loadKnowledgePlugin();
        if (!plugins.some((p) => p === knowledgePlugin)) {
          plugins.push(knowledgePlugin);
          console.log(
            `[AgentLoader] ✓ Loaded character plugin: ${pluginName} (lazy-loaded)`
          );
        }
        continue;
      }

      const plugin = AVAILABLE_PLUGINS[pluginName];

      if (plugin) {
        // Avoid duplicates
        if (!plugins.some((p) => p === plugin)) {
          plugins.push(plugin);
          console.log(`[AgentLoader] ✓ Loaded character plugin: ${pluginName}`);
        }
      } else {
        console.warn(`[AgentLoader] ⚠ Unknown character plugin: ${pluginName}`);
      }
    }

    console.log(`[AgentLoader] Total plugins loaded: ${plugins.length}`);

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
export const agentLoader = new AgentLoader();
