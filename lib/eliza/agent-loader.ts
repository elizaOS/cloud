import type { Character, Plugin, Provider, Action } from "@elizaos/core";
import { elizaOSCloudPlugin } from "@elizaos/plugin-elizacloud";
import { memoryPlugin } from "@elizaos/plugin-memory";
import { elevenLabsPlugin } from "@elizaos/plugin-elevenlabs";
import mcpPlugin from "@elizaos/plugin-mcp";
import { assistantPlugin } from "./plugin-assistant";
import { chatPlaygroundPlugin } from "./plugin-chat-playground";
import { characterBuilderPlugin } from "./plugin-character-builder";
import { charactersService } from "@/lib/services/characters";
import type { ElizaCharacter } from "@/lib/types";
import defaultAgent from "./agent";
import { getElizaCloudApiUrl } from "./config";
import { AgentMode, AGENT_MODE_PLUGINS } from "./agent-mode-types";

async function loadKnowledgePlugin() {
  const { knowledgePluginCore } = await import("@elizaos/plugin-knowledge");
  return knowledgePluginCore;
}

const AVAILABLE_PLUGINS: Record<string, Plugin> = {
  "@elizaos/plugin-elizacloud": elizaOSCloudPlugin as unknown as Plugin,
  "@elizaos/plugin-elevenlabs": elevenLabsPlugin as unknown as Plugin,
  "@elizaos/plugin-memory": memoryPlugin as unknown as Plugin,
  "@elizaos/plugin-mcp": mcpPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-assistant": assistantPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-chat-playground": chatPlaygroundPlugin as unknown as Plugin,
  "@eliza-cloud/plugin-character-builder": characterBuilderPlugin as unknown as Plugin,
};

/**
 * Loads characters and resolves plugins based on AgentMode.
 */
export class AgentLoader {
  async loadCharacter(characterId: string, agentMode: AgentMode): Promise<{ character: Character; plugins: Plugin[] }> {
    const dbCharacter = await charactersService.getById(characterId);
    if (!dbCharacter) {
      throw new Error(`Character not found: ${characterId}`);
    }

    const elizaCharacter = charactersService.toElizaCharacter(dbCharacter);
    const character = this.buildCharacter(elizaCharacter);

    // Auto-switch to ASSISTANT mode if character has MCP plugin
    const effectiveMode = (elizaCharacter.plugins || []).includes("@elizaos/plugin-mcp") && agentMode !== AgentMode.ASSISTANT
      ? AgentMode.ASSISTANT
      : agentMode;

    const plugins = await this.resolvePlugins(effectiveMode, elizaCharacter.plugins || []);
    return { character, plugins };
  }

  async getDefaultCharacter(agentMode: AgentMode): Promise<{ character: Character; plugins: Plugin[] }> {
    const plugins = await this.resolvePlugins(agentMode, []);
    return { character: defaultAgent.character, plugins };
  }

  /** Build Character with merged settings (env + character config) */
  private buildCharacter(elizaCharacter: ElizaCharacter): Character {
    const characterId = elizaCharacter.id || "b850bc30-45f8-0041-a00a-83df46d8555d";
    const charSettings = elizaCharacter.settings || {};
    const getSetting = (key: string, fallback: string) =>
      (charSettings[key] as string) || process.env[key] || fallback;

    const settings: Record<string, unknown> = {
      ...charSettings,
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
      ELEVENLABS_VOICE_ID: getSetting("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
      ELEVENLABS_MODEL_ID: getSetting("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
      ELEVENLABS_VOICE_STABILITY: getSetting("ELEVENLABS_VOICE_STABILITY", "0.5"),
      ELEVENLABS_VOICE_SIMILARITY_BOOST: getSetting("ELEVENLABS_VOICE_SIMILARITY_BOOST", "0.75"),
      ELEVENLABS_VOICE_STYLE: getSetting("ELEVENLABS_VOICE_STYLE", "0"),
      ELEVENLABS_VOICE_USE_SPEAKER_BOOST: getSetting("ELEVENLABS_VOICE_USE_SPEAKER_BOOST", "true"),
      ELEVENLABS_OPTIMIZE_STREAMING_LATENCY: getSetting("ELEVENLABS_OPTIMIZE_STREAMING_LATENCY", "0"),
      ELEVENLABS_OUTPUT_FORMAT: getSetting("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"),
      ELEVENLABS_LANGUAGE_CODE: getSetting("ELEVENLABS_LANGUAGE_CODE", "en"),
      ELEVENLABS_STT_MODEL_ID: getSetting("ELEVENLABS_STT_MODEL_ID", "scribe_v1"),
      ELEVENLABS_STT_LANGUAGE_CODE: getSetting("ELEVENLABS_STT_LANGUAGE_CODE", "en"),
      ELEVENLABS_STT_TIMESTAMPS_GRANULARITY: getSetting("ELEVENLABS_STT_TIMESTAMPS_GRANULARITY", "word"),
      ELEVENLABS_STT_DIARIZE: getSetting("ELEVENLABS_STT_DIARIZE", "false"),
      ...(charSettings.ELEVENLABS_STT_NUM_SPEAKERS || process.env.ELEVENLABS_STT_NUM_SPEAKERS
        ? { ELEVENLABS_STT_NUM_SPEAKERS: charSettings.ELEVENLABS_STT_NUM_SPEAKERS || process.env.ELEVENLABS_STT_NUM_SPEAKERS }
        : {}),
      ELEVENLABS_STT_TAG_AUDIO_EVENTS: getSetting("ELEVENLABS_STT_TAG_AUDIO_EVENTS", "false"),
      avatarUrl: elizaCharacter.avatarUrl || elizaCharacter.avatar_url,
    };

    return {
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
  }

  /** Resolve plugins based on mode + character-specific additions */
  private async resolvePlugins(agentMode: AgentMode, characterPlugins: string[]): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const allPluginNames = [...AGENT_MODE_PLUGINS[agentMode], ...characterPlugins];

    for (const pluginName of allPluginNames) {
      // Knowledge plugin lazy-loaded (SSR compatibility)
      if (pluginName === "@elizaos/plugin-knowledge") {
        const knowledgePlugin = await loadKnowledgePlugin();
        if (!plugins.includes(knowledgePlugin)) plugins.push(knowledgePlugin);
        continue;
      }

      const plugin = AVAILABLE_PLUGINS[pluginName];
      if (plugin && !plugins.includes(plugin)) {
        plugins.push(plugin);
      }
    }

    return plugins;
  }

  getProvidersAndActions(plugins: Plugin[]): { providers: Provider[]; actions: Action[] } {
    return {
      providers: plugins.flatMap((p) => p.providers || []).filter(Boolean),
      actions: plugins.flatMap((p) => p.actions || []).filter(Boolean),
    };
  }
}

// Export singleton instance
export const agentLoader = new AgentLoader();
