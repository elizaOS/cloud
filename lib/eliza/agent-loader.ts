import {
  elizaLogger,
  type Character,
  type Plugin,
  type Provider,
  type Action,
} from "@elizaos/core";
import { elizaOSCloudPlugin } from "@elizaos/plugin-elizacloud";
import { memoryPlugin } from "@elizaos/plugin-memory";
import { elevenLabsPlugin } from "@elizaos/plugin-elevenlabs";
import mcpPlugin from "@elizaos/plugin-mcp";
import { assistantPlugin } from "./plugin-assistant";
import { chatPlaygroundPlugin } from "./plugin-chat-playground";
import { characterBuilderPlugin } from "./plugin-character-builder";
import { charactersService } from "@/lib/services/characters";
import { memoriesRepository } from "@/db/repositories/agents/memories";
import type { ElizaCharacter } from "@/lib/types";
import type { UserCharacter } from "@/db/schemas/user-characters";
import defaultAgent from "./agent";
import { getElizaCloudApiUrl } from "./config";
import {
  AgentMode,
  AGENT_MODE_PLUGINS,
  SETTINGS_PLUGIN_MAP,
  getConditionalPlugins,
  requiresAssistantMode,
} from "./agent-mode-types";
import { loadAgentSecrets, isSecretsConfigured } from "@/lib/services/secrets";
import {
  isOrgCharacter,
  getOrgCharacter,
  orgCharacters,
} from "./characters/org";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";

/**
 * Reasons why mode was upgraded to ASSISTANT.
 * Used for logging and debugging.
 */
export type ModeUpgradeReason =
  | "settings_plugin"
  | "explicit_plugin"
  | "has_knowledge"
  | "mcp_plugin"
  | "none";

export interface ModeResolution {
  mode: AgentMode;
  upgradeReason: ModeUpgradeReason;
}

/**
 * Checks if any settings-based plugins are explicitly listed in character plugins.
 * Used to upgrade mode when MCP or similar plugins are in the plugins array.
 */
function hasExplicitSettingsPlugin(characterPlugins: string[]): boolean {
  const settingsPluginNames: string[] = Object.values(SETTINGS_PLUGIN_MAP);
  return characterPlugins.some((p) => settingsPluginNames.includes(p));
}

/**
 * Determines the effective agent mode based on character capabilities.
 * Upgrades to ASSISTANT mode when advanced features are needed.
 *
 * @param requestedMode - The mode originally requested
 * @param characterId - The character ID to check capabilities for
 * @param characterSettings - Settings configured on the character
 * @param characterPlugins - Plugins explicitly listed on the character
 * @returns The effective mode and reason for any upgrade
 */
async function resolveEffectiveMode(
  requestedMode: AgentMode,
  characterId: string,
  characterSettings: Record<string, unknown>,
  characterPlugins: string[],
): Promise<ModeResolution> {
  // BUILD mode is never upgraded - it's a specific workflow
  if (requestedMode === AgentMode.BUILD) {
    return { mode: requestedMode, upgradeReason: "none" };
  }

  // Already ASSISTANT mode - no upgrade needed
  if (requestedMode === AgentMode.ASSISTANT) {
    return { mode: requestedMode, upgradeReason: "none" };
  }

  // Check 1: Settings-based plugins (mcp, webSearch, etc.) require ASSISTANT mode
  if (requiresAssistantMode(characterSettings)) {
    return { mode: AgentMode.ASSISTANT, upgradeReason: "settings_plugin" };
  }

  // Check 2: Explicit settings-based plugins in character plugins require ASSISTANT mode
  // MCP plugin requires ASSISTANT mode for tool execution even when explicitly listed
  if (hasExplicitSettingsPlugin(characterPlugins)) {
    return { mode: AgentMode.ASSISTANT, upgradeReason: "explicit_plugin" };
  }

  // Check 3: Knowledge documents require ASSISTANT mode for RAG
  const documentCount = await memoriesRepository.countByType(
    characterId,
    "documents",
    characterId,
  );
  if (documentCount > 0) {
    return { mode: AgentMode.ASSISTANT, upgradeReason: "has_knowledge" };
  }

  // No upgrade needed
  return { mode: requestedMode, upgradeReason: "none" };
}

async function loadKnowledgePlugin() {
  const { knowledgePluginCore } = await import("@elizaos/plugin-knowledge");
  return knowledgePluginCore;
}

/**
 * Cast external plugin to local Plugin type.
 * Required because external @elizaos plugins may be compiled against
 * different @elizaos/core versions, causing structural type mismatches
 * even though the Plugin interface is identical.
 */
function asPlugin<T extends { name: string; description: string }>(
  plugin: T,
): Plugin {
  return plugin as Plugin;
}

const AVAILABLE_PLUGINS: Record<string, Plugin> = {
  "@elizaos/plugin-elizacloud": asPlugin(elizaOSCloudPlugin),
  "@elizaos/plugin-elevenlabs": asPlugin(elevenLabsPlugin),
  "@elizaos/plugin-memory": asPlugin(memoryPlugin),
  "@elizaos/plugin-mcp": asPlugin(mcpPlugin),
  // Local plugins don't need casting - they use the same @elizaos/core
  "@eliza-cloud/plugin-assistant": assistantPlugin,
  "@eliza-cloud/plugin-chat-playground": chatPlaygroundPlugin,
  "@eliza-cloud/plugin-character-builder": characterBuilderPlugin,
};

/**
 * Loads characters and resolves plugins based on AgentMode.
 */
export class AgentLoader {
  async loadCharacter(
    characterId: string,
    agentMode: AgentMode,
  ): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    // Check if this is an org character (built-in cloud agents)
    if (isOrgCharacter(characterId)) {
      return this.loadOrgCharacter(characterId, agentMode);
    }

    const dbCharacter = await charactersService.getById(characterId);
    if (!dbCharacter) {
      throw new Error(`Character not found: ${characterId}`);
    }

    const elizaCharacter = charactersService.toElizaCharacter(dbCharacter);

    // Build character with secrets loaded from secrets service
    const character = await this.buildCharacter(elizaCharacter, dbCharacter);
    const characterSettings = (elizaCharacter.settings ?? {}) as Record<
      string,
      unknown
    >;
    const characterPlugins = elizaCharacter.plugins || [];

    // Resolve effective mode based on character capabilities
    const modeResolution = await resolveEffectiveMode(
      agentMode,
      characterId,
      characterSettings,
      characterPlugins,
    );

    const plugins = await this.resolvePlugins(
      modeResolution.mode,
      characterPlugins,
      characterSettings,
    );
    return { character, plugins, modeResolution };
  }

  /**
   * Load a built-in org character (Jimmy, Eli5, Eddy, Ruby, Laura)
   * These characters use org-tools MCP and are always in ASSISTANT mode.
   *
   * If organizationId is provided, attempts to load org-specific configuration
   * from the database (custom settings, secrets, platform configs).
   */
  async loadOrgCharacter(
    characterId: string,
    _agentMode: AgentMode,
    organizationId?: string,
  ): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    const baseCharacter = getOrgCharacter(characterId);
    if (!baseCharacter) {
      throw new Error(`Org character not found: ${characterId}`);
    }

    let character: Character = baseCharacter;

    // If organization provided, try to load configured character
    if (organizationId) {
      const agentType = characterId as keyof typeof orgCharacters;
      const instance = await agentLifecycleService.getInstance(
        organizationId,
        agentType,
      );

      if (instance && instance.enabled) {
        // Load fully configured character with org-specific settings
        character = await agentLifecycleService.buildConfiguredCharacter(
          organizationId,
          agentType,
        );
        elizaLogger.info(
          `[AgentLoader] Loaded configured org agent: ${character.name} for org ${organizationId}`,
        );
      } else {
        elizaLogger.info(
          `[AgentLoader] Using base org character: ${character.name} (no org config)`,
        );
      }
    }

    // Org characters always use ASSISTANT mode (they have MCP tools)
    const modeResolution: ModeResolution = {
      mode: AgentMode.ASSISTANT,
      upgradeReason: "mcp_plugin",
    };

    const characterSettings = (character.settings ?? {}) as Record<
      string,
      unknown
    >;
    const plugins = await this.resolvePlugins(
      AgentMode.ASSISTANT,
      character.plugins || [],
      characterSettings,
    );

    return { character, plugins, modeResolution };
  }

  /**
   * Load an org character for a specific organization.
   * This is the preferred method when you have an organization context.
   */
  async loadOrgCharacterForOrg(
    characterId: string,
    organizationId: string,
    agentMode: AgentMode = AgentMode.ASSISTANT,
  ): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    return this.loadOrgCharacter(characterId, agentMode, organizationId);
  }

  async getDefaultCharacter(agentMode: AgentMode): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    // Default character has no capabilities that require mode upgrade
    const modeResolution: ModeResolution = {
      mode: agentMode,
      upgradeReason: "none",
    };
    const plugins = await this.resolvePlugins(agentMode, [], {});
    return { character: defaultAgent.character, plugins, modeResolution };
  }

  /**
   * Build Character with merged settings from multiple sources:
   * 1. Character settings from DB (elizaCharacter.settings)
   * 2. Encrypted secrets from secrets service (org + project-scoped)
   * 3. Environment variables (process.env)
   *
   * Priority: Secrets service > Character settings > Env vars
   */
  private async buildCharacter(
    elizaCharacter: ElizaCharacter,
    dbCharacter: UserCharacter,
  ): Promise<Character> {
    const characterId =
      elizaCharacter.id || "b850bc30-45f8-0041-a00a-83df46d8555d";
    const charSettings = elizaCharacter.settings || {};
    const getSetting = (key: string, fallback: string) =>
      (charSettings[key] as string) || process.env[key] || fallback;

    // Load secrets from secrets service (org + character-scoped)
    const secrets = isSecretsConfigured()
      ? await loadAgentSecrets({
          organizationId: dbCharacter.organization_id,
          characterId: dbCharacter.id,
        })
      : {};

    // Merge settings - secrets take highest priority
    const settings: Record<
      string,
      string | boolean | number | Record<string, unknown>
    > = {
      ...charSettings,
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
      ELEVENLABS_VOICE_ID: getSetting(
        "ELEVENLABS_VOICE_ID",
        "EXAVITQu4vr4xnSDxMaL",
      ),
      ELEVENLABS_MODEL_ID: getSetting(
        "ELEVENLABS_MODEL_ID",
        "eleven_flash_v2_5",
      ),
      ELEVENLABS_VOICE_STABILITY: getSetting(
        "ELEVENLABS_VOICE_STABILITY",
        "0.5",
      ),
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
      ELEVENLABS_STT_MODEL_ID: getSetting(
        "ELEVENLABS_STT_MODEL_ID",
        "scribe_v1",
      ),
      ELEVENLABS_STT_LANGUAGE_CODE: getSetting(
        "ELEVENLABS_STT_LANGUAGE_CODE",
        "en",
      ),
      ELEVENLABS_STT_TIMESTAMPS_GRANULARITY: getSetting(
        "ELEVENLABS_STT_TIMESTAMPS_GRANULARITY",
        "word",
      ),
      ELEVENLABS_STT_DIARIZE: getSetting("ELEVENLABS_STT_DIARIZE", "false"),
      ...(charSettings.ELEVENLABS_STT_NUM_SPEAKERS ||
      process.env.ELEVENLABS_STT_NUM_SPEAKERS
        ? {
            ELEVENLABS_STT_NUM_SPEAKERS:
              charSettings.ELEVENLABS_STT_NUM_SPEAKERS ||
              process.env.ELEVENLABS_STT_NUM_SPEAKERS,
          }
        : {}),
      ELEVENLABS_STT_TAG_AUDIO_EVENTS: getSetting(
        "ELEVENLABS_STT_TAG_AUDIO_EVENTS",
        "false",
      ),
      ...(elizaCharacter.avatarUrl || elizaCharacter.avatar_url
        ? { avatarUrl: elizaCharacter.avatarUrl || elizaCharacter.avatar_url }
        : {}),
      ...secrets,
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

  /** Resolve plugins based on mode + character-specific additions + settings-based conditionals */
  private async resolvePlugins(
    agentMode: AgentMode,
    characterPlugins: string[],
    characterSettings: Record<string, unknown>,
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const conditionalPlugins = getConditionalPlugins(characterSettings);
    const allPluginNames = [
      ...AGENT_MODE_PLUGINS[agentMode],
      ...characterPlugins,
      ...conditionalPlugins,
    ];

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

  getProvidersAndActions(plugins: Plugin[]): {
    providers: Provider[];
    actions: Action[];
  } {
    return {
      providers: plugins.flatMap((p) => p.providers || []).filter(Boolean),
      actions: plugins.flatMap((p) => p.actions || []).filter(Boolean),
    };
  }
}

// Export singleton instance
export const agentLoader = new AgentLoader();
