import type { Character, Plugin, Provider, Action } from "@elizaos/core";
import { elizaOSCloudPlugin } from "@elizaos/plugin-elizacloud";
import { memoryPlugin } from "@elizaos/plugin-memory";
import { elevenLabsPlugin } from "@elizaos/plugin-elevenlabs";
import mcpPlugin from "@elizaos/plugin-mcp";
import { TwitterPlugin } from "@elizaos/plugin-twitter";
import { assistantPlugin } from "./plugin-assistant";
import { twitterAutomationService } from "@/lib/services/twitter-automation";
import type { TwitterSettings } from "./agent-mode-types";
import { affiliatePlugin } from "./plugin-affiliate";
import { chatPlaygroundPlugin } from "./plugin-chat-playground";
import { characterBuilderPlugin } from "./plugin-character-builder";
import { charactersService } from "@/lib/services/characters";
import { memoriesRepository } from "@/db/repositories/agents/memories";
import type { ElizaCharacter } from "@/lib/types";
import defaultAgent from "./agent";
import { getElizaCloudApiUrl, buildElevenLabsSettings } from "./config";
import {
  AgentMode,
  AGENT_MODE_PLUGINS,
  SETTINGS_PLUGIN_MAP,
  getConditionalPlugins,
  requiresAssistantMode,
  hasAffiliateData,
} from "./agent-mode-types";

/**
 * PERFORMANCE: Pre-loaded plugin cache
 * Plugins are loaded once at module initialization and cached.
 * This eliminates dynamic import latency (~50-200ms per plugin).
 */
let _knowledgePlugin: Plugin | null = null;
let _webSearchPlugin: Plugin | null = null;
let _pluginsPreloading = false;

/**
 * Pre-warm plugin cache at module load.
 * This runs in the background during app startup.
 */
async function preloadPlugins(): Promise<void> {
  if (_pluginsPreloading) return;
  _pluginsPreloading = true;

  try {
    // Load both plugins in parallel
    const [knowledgeModule, webSearchModule] = await Promise.all([
      import("@elizaos/plugin-knowledge").catch((e) => {
        console.warn("[AgentLoader] Failed to preload knowledge plugin:", e);
        return null;
      }),
      import("@elizaos/plugin-web-search").catch((e) => {
        console.warn("[AgentLoader] Failed to preload web-search plugin:", e);
        return null;
      }),
    ]);

    if (knowledgeModule) {
      _knowledgePlugin = knowledgeModule.knowledgePluginCore;
    }
    if (webSearchModule) {
      _webSearchPlugin = webSearchModule.webSearchPlugin;
    }

    console.log("[AgentLoader] ⚡ Plugins preloaded successfully");
  } catch (e) {
    console.error("[AgentLoader] Plugin preload failed:", e);
  }
}

// Trigger preload immediately when module is imported
preloadPlugins();

/**
 * Reasons why mode was upgraded to ASSISTANT.
 * Used for logging and debugging.
 */
export type ModeUpgradeReason =
  | "settings_plugin"
  | "explicit_plugin"
  | "has_knowledge"
  | "none";

export interface ModeResolution {
  mode: AgentMode;
  upgradeReason: ModeUpgradeReason;
  /** Document count from mode resolution - reuse to avoid duplicate DB query */
  documentCount?: number;
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
 * @returns The effective mode, reason for any upgrade, and document count (to avoid duplicate DB query)
 */
async function resolveEffectiveMode(
  requestedMode: AgentMode,
  characterId: string,
  characterSettings: Record<string, unknown>,
  characterPlugins: string[],
): Promise<ModeResolution> {
  // BUILD mode is never upgraded - it's a specific workflow
  if (requestedMode === AgentMode.BUILD) {
    return { mode: requestedMode, upgradeReason: "none", documentCount: 0 };
  }

  // Query document count once - needed for multiple checks and plugin resolution
  const documentCount = await memoriesRepository.countByType(
    characterId,
    "documents",
    characterId,
  );

  // Already ASSISTANT mode - no upgrade needed
  if (requestedMode === AgentMode.ASSISTANT) {
    return { mode: requestedMode, upgradeReason: "none", documentCount };
  }

  // Check 1: Settings-based plugins (mcp, webSearch, etc.) require ASSISTANT mode
  if (requiresAssistantMode(characterSettings)) {
    return {
      mode: AgentMode.ASSISTANT,
      upgradeReason: "settings_plugin",
      documentCount,
    };
  }

  // Check 2: Explicit settings-based plugins in character plugins require ASSISTANT mode
  // MCP plugin requires ASSISTANT mode for tool execution even when explicitly listed
  if (hasExplicitSettingsPlugin(characterPlugins)) {
    return {
      mode: AgentMode.ASSISTANT,
      upgradeReason: "explicit_plugin",
      documentCount,
    };
  }

  // Check 3: Knowledge documents require ASSISTANT mode for RAG
  if (documentCount > 0) {
    return {
      mode: AgentMode.ASSISTANT,
      upgradeReason: "has_knowledge",
      documentCount,
    };
  }

  // No upgrade needed
  return { mode: requestedMode, upgradeReason: "none", documentCount };
}

/**
 * Get knowledge plugin from cache or load if not ready.
 * PERFORMANCE: Returns cached plugin instantly when preloaded.
 */
async function getKnowledgePlugin(): Promise<Plugin> {
  if (_knowledgePlugin) return _knowledgePlugin;

  // Fallback to dynamic import if preload hasn't completed
  const { knowledgePluginCore } = await import("@elizaos/plugin-knowledge");
  _knowledgePlugin = knowledgePluginCore;
  return knowledgePluginCore;
}

/**
 * Get web search plugin from cache or load if not ready.
 * PERFORMANCE: Returns cached plugin instantly when preloaded.
 */
async function getWebSearchPlugin(): Promise<Plugin> {
  if (_webSearchPlugin) return _webSearchPlugin;

  // Fallback to dynamic import if preload hasn't completed
  const { webSearchPlugin } = await import("@elizaos/plugin-web-search");
  _webSearchPlugin = webSearchPlugin;
  return webSearchPlugin;
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
  "@elizaos/plugin-twitter": asPlugin(TwitterPlugin),
  // Local plugins don't need casting - they use the same @elizaos/core
  "@eliza-cloud/plugin-assistant": assistantPlugin,
  "@eliza-cloud/plugin-affiliate": affiliatePlugin,
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
    options?: { webSearchEnabled?: boolean },
  ): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    const dbCharacter = await charactersService.getById(characterId);
    if (!dbCharacter) {
      throw new Error(`Character not found: ${characterId}`);
    }

    const elizaCharacter = charactersService.toElizaCharacter(dbCharacter);
    const characterSettings = (elizaCharacter.settings ?? {}) as Record<
      string,
      unknown
    >;
    const characterPlugins = elizaCharacter.plugins || [];

    // Inject webSearch settings if enabled via chat UI
    if (options?.webSearchEnabled) {
      characterSettings.webSearch = { enabled: true };
    }

    // Build character with potential Twitter credentials injection
    const character = await this.buildCharacter(
      elizaCharacter,
      dbCharacter.organization_id,
      characterSettings,
    );

    // Resolve effective mode based on character capabilities
    // NOTE: modeResolution includes documentCount to avoid duplicate DB query
    const modeResolution = await resolveEffectiveMode(
      agentMode,
      characterId,
      characterSettings,
      characterPlugins,
    );

    // Reuse documentCount from mode resolution (avoids duplicate DB query)
    const hasKnowledge = (modeResolution.documentCount ?? 0) > 0;

    const plugins = await this.resolvePlugins(
      modeResolution.mode,
      characterPlugins,
      characterSettings,
      { hasKnowledge },
    );
    return { character, plugins, modeResolution };
  }

  async getDefaultCharacter(
    agentMode: AgentMode,
    options?: { webSearchEnabled?: boolean },
  ): Promise<{
    character: Character;
    plugins: Plugin[];
    modeResolution: ModeResolution;
  }> {
    // Default character has no capabilities that require mode upgrade
    const modeResolution: ModeResolution = {
      mode: agentMode,
      upgradeReason: "none",
    };
    // Inject webSearch settings if enabled via chat UI
    const characterSettings: Record<string, unknown> = {};
    if (options?.webSearchEnabled) {
      characterSettings.webSearch = { enabled: true };
    }
    const plugins = await this.resolvePlugins(agentMode, [], characterSettings);
    return { character: defaultAgent.character, plugins, modeResolution };
  }

  /** Build Character with merged settings (env + character config) */
  private async buildCharacter(
    elizaCharacter: ElizaCharacter,
    organizationId: string,
    characterSettings: Record<string, unknown>,
  ): Promise<Character> {
    const characterId =
      elizaCharacter.id || "b850bc30-45f8-0041-a00a-83df46d8555d";
    const charSettings = (elizaCharacter.settings || {}) as Record<
      string,
      unknown
    >;

    const settings: Record<
      string,
      string | boolean | number | Record<string, unknown>
    > = {
      ...charSettings,
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      // ElevenLabs settings (shared config)
      ...buildElevenLabsSettings(charSettings),
      ...(elizaCharacter.avatarUrl || elizaCharacter.avatar_url
        ? { avatarUrl: elizaCharacter.avatarUrl || elizaCharacter.avatar_url }
        : {}),
    };

    // Inject Twitter credentials if Twitter automation is enabled
    const twitterSettings = characterSettings.twitter as
      | TwitterSettings
      | undefined;
    if (twitterSettings?.enabled) {
      const twitterCreds =
        await twitterAutomationService.getCredentialsForAgent(organizationId);
      if (twitterCreds) {
        // Inject API credentials
        settings.TWITTER_API_KEY = twitterCreds.TWITTER_API_KEY;
        settings.TWITTER_API_SECRET_KEY = twitterCreds.TWITTER_API_SECRET_KEY;
        settings.TWITTER_ACCESS_TOKEN = twitterCreds.TWITTER_ACCESS_TOKEN;
        settings.TWITTER_ACCESS_TOKEN_SECRET =
          twitterCreds.TWITTER_ACCESS_TOKEN_SECRET;

        // Map UI settings to plugin env vars
        settings.TWITTER_ENABLE_POST = twitterSettings.autoPost ?? false;
        settings.TWITTER_ENABLE_REPLIES = twitterSettings.autoReply ?? true;
        settings.TWITTER_ENABLE_ACTIONS = twitterSettings.autoEngage ?? false;
        settings.TWITTER_ENABLE_DISCOVERY = twitterSettings.discovery ?? false;
        settings.TWITTER_DRY_RUN = twitterSettings.dryRun ?? false;

        if (twitterSettings.postIntervalMin) {
          settings.TWITTER_POST_INTERVAL_MIN = twitterSettings.postIntervalMin;
        }
        if (twitterSettings.postIntervalMax) {
          settings.TWITTER_POST_INTERVAL_MAX = twitterSettings.postIntervalMax;
        }
        if (twitterSettings.targetUsers) {
          settings.TWITTER_TARGET_USERS = twitterSettings.targetUsers;
        }
      }
    }

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
    options?: { hasKnowledge?: boolean },
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const isAffiliate = hasAffiliateData(characterSettings);

    // Affiliate characters don't get conditional plugins (no web search)
    // They use plugin-affiliate exclusively for their functionality
    const conditionalPlugins = isAffiliate
      ? []
      : getConditionalPlugins(characterSettings);

    // Build plugin list, swapping assistant for affiliate when needed
    const modePlugins = AGENT_MODE_PLUGINS[agentMode].map((pluginName) => {
      if (isAffiliate && pluginName === "@eliza-cloud/plugin-assistant") {
        return "@eliza-cloud/plugin-affiliate";
      }
      return pluginName;
    });

    const allPluginNames = [
      ...modePlugins,
      ...characterPlugins,
      ...conditionalPlugins,
    ];

    // Always add knowledge plugin for ASSISTANT mode
    // This enables both knowledge queries (if docs exist) and uploading new docs
    if (agentMode === AgentMode.ASSISTANT) {
      allPluginNames.push("@elizaos/plugin-knowledge");
    }

    for (const pluginName of allPluginNames) {
      // Knowledge plugin - use preloaded cache for instant access
      if (pluginName === "@elizaos/plugin-knowledge") {
        const knowledgePlugin = await getKnowledgePlugin();
        if (!plugins.includes(knowledgePlugin)) plugins.push(knowledgePlugin);
        continue;
      }

      // Web search plugin - use preloaded cache for instant access
      if (pluginName === "@elizaos/plugin-web-search") {
        const webSearchPlugin = await getWebSearchPlugin();
        if (!plugins.includes(webSearchPlugin)) plugins.push(webSearchPlugin);
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
