/**
 * Runtime Factory - Creates configured ElizaOS runtimes per user/agent context.
 */

import {
  AgentRuntime,
  stringToUuid,
  elizaLogger,
  type UUID,
  type Character,
  type Plugin,
  type IDatabaseAdapter,
  type Logger,
  type World,
} from "@elizaos/core";
import { createDatabaseAdapter } from "@elizaos/plugin-sql/node";
import { agentLoader } from "./agent-loader";
import { getElizaCloudApiUrl, getDefaultModels } from "./config";
import type { UserContext } from "./user-context";
import { logger } from "@/lib/utils/logger";
import "@/lib/polyfills/dom-polyfills";

interface GlobalWithEliza {
  logger?: Logger;
}

const globalAny = globalThis as GlobalWithEliza;

export class RuntimeFactory {
  private static instance: RuntimeFactory;
  private readonly DEFAULT_AGENT_ID = stringToUuid(
    "b850bc30-45f8-0041-a00a-83df46d8555d",
  ) as UUID;
  private readonly DEFAULT_AGENT_ID_STRING =
    "b850bc30-45f8-0041-a00a-83df46d8555d";

  private constructor() {
    this.initializeLoggers();
  }

  static getInstance(): RuntimeFactory {
    if (!this.instance) {
      this.instance = new RuntimeFactory();
    }
    return this.instance;
  }

  /**
   * Create runtime for user context. Each agent gets a fresh DB adapter (no caching)
   * to prevent cross-agent data contamination.
   */
  async createRuntimeForUser(context: UserContext): Promise<AgentRuntime> {
    elizaLogger.info(
      `[RuntimeFactory] Creating runtime: user=${context.userId}, mode=${context.agentMode}, char=${context.characterId || "default"}`,
    );

    const isDefaultCharacter =
      !context.characterId ||
      context.characterId === this.DEFAULT_AGENT_ID_STRING;
    const { character, plugins, modeResolution } = isDefaultCharacter
      ? await agentLoader.getDefaultCharacter(context.agentMode)
      : await agentLoader.loadCharacter(
          context.characterId!,
          context.agentMode,
        );

    // Log mode upgrade if it occurred
    if (modeResolution.upgradeReason !== "none") {
      elizaLogger.info(
        `[RuntimeFactory] Mode upgraded: ${context.agentMode} → ${modeResolution.mode} (reason: ${modeResolution.upgradeReason})`,
      );
    }

    const agentId = (
      character.id ? stringToUuid(character.id) : this.DEFAULT_AGENT_ID
    ) as UUID;
    elizaLogger.info(
      `[RuntimeFactory] Character: ${character.name} (${agentId})`,
    );

    const dbAdapter = await this.createDatabaseAdapter(agentId);
    const settings = this.buildSettings(character, context);
    const filteredPlugins = this.filterPlugins(plugins);

    const runtime = new AgentRuntime({
      character: { ...character, id: agentId, settings },
      plugins: filteredPlugins,
      agentId,
    });

    runtime.registerDatabaseAdapter(dbAdapter);
    this.ensureRuntimeLogger(runtime);
    await this.initializeRuntime(runtime, character, agentId);
    await this.waitForMcpServiceIfNeeded(runtime, filteredPlugins);

    elizaLogger.success(
      `[RuntimeFactory] Runtime ready: ${character.name} (${modeResolution.mode})`,
    );
    return runtime;
  }

  /** Expand pathname URLs to full URLs in MCP settings */
  private transformMcpSettings(
    mcpSettings: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!mcpSettings?.servers) return mcpSettings;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const transformedServers: Record<string, unknown> = {};

    for (const [serverId, serverConfig] of Object.entries(
      mcpSettings.servers as Record<string, { url?: string }>,
    )) {
      transformedServers[serverId] = {
        ...serverConfig,
        url: serverConfig.url?.startsWith("/")
          ? `${baseUrl}${serverConfig.url}`
          : serverConfig.url,
      };
    }

    return { ...mcpSettings, servers: transformedServers };
  }

  /** Create fresh DB adapter for agent (no caching - prevents cross-agent contamination) */
  private async createDatabaseAdapter(
    agentId: UUID,
  ): Promise<IDatabaseAdapter> {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const dbAdapter = createDatabaseAdapter(
      { postgresUrl: process.env.DATABASE_URL },
      agentId,
    );
    await dbAdapter.init();
    return dbAdapter;
  }

  private filterPlugins(plugins: Plugin[]): Plugin[] {
    return plugins.filter((p) => p.name !== "@elizaos/plugin-sql") as Plugin[];
  }

  /** Build settings with user context overrides */
  private buildSettings(
    character: Character,
    context: UserContext,
  ): NonNullable<Character["settings"]> {
    const charSettings = character.settings || {};
    const getSetting = (key: string, fallback: string) =>
      (charSettings[key] as string) || process.env[key] || fallback;

    return {
      ...charSettings,
      // Database
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,
      // ElizaCloud (user prefs override character)
      ELIZAOS_CLOUD_API_KEY: context.apiKey,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELIZAOS_CLOUD_SMALL_MODEL:
        context.modelPreferences?.smallModel ||
        getSetting("ELIZAOS_CLOUD_SMALL_MODEL", getDefaultModels().small),
      ELIZAOS_CLOUD_LARGE_MODEL:
        context.modelPreferences?.largeModel ||
        getSetting("ELIZAOS_CLOUD_LARGE_MODEL", getDefaultModels().large),
      // ElevenLabs TTS
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
      ELEVENLABS_VOICE_ID: getSetting(
        "ELEVENLABS_VOICE_ID",
        "EXAVITQu4vr4xnSDxMaL",
      ),
      ELEVENLABS_MODEL_ID: getSetting(
        "ELEVENLABS_MODEL_ID",
        "eleven_multilingual_v2",
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
      // ElevenLabs STT
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
      // MCP
      ...(charSettings.mcp
        ? {
            mcp: this.transformMcpSettings(
              charSettings.mcp as Record<string, unknown>,
            ),
          }
        : {}),
      // User metadata
      USER_ID: context.userId,
      ENTITY_ID: context.entityId,
      ORGANIZATION_ID: context.organizationId,
      IS_ANONYMOUS: context.isAnonymous,
      // App-specific prompt config (for APP_CONFIG provider)
      ...(context.appPromptConfig
        ? { appPromptConfig: context.appPromptConfig }
        : {}),
    };
  }

  /** Initialize runtime, ensuring agent/world exist */
  private async initializeRuntime(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    // Initialize runtime (creates agent in agents table first, then world)
    try {
      await runtime.initialize({ skipMigrations: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isDuplicate =
        msg.toLowerCase().includes("duplicate") ||
        msg.toLowerCase().includes("unique constraint") ||
        msg.includes("Failed to create entity") ||
        msg.includes("Failed to create agent");
      if (!isDuplicate) throw e;
    }

    // Ensure agent exists after initialize
    if (!(await runtime.getAgent(agentId))) {
      await this.ensureAgentExists(runtime, character, agentId);
    }

    // Now create world (FK constraint requires agent to exist first)
    try {
      await runtime.ensureWorldExists({
        id: agentId,
        name: `World for ${character.name}`,
        agentId,
        serverId: agentId,
      } as World);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !msg.toLowerCase().includes("duplicate") &&
        !msg.toLowerCase().includes("unique constraint")
      )
        throw e;
    }
  }

  private async ensureAgentExists(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    try {
      await runtime.createEntity({
        id: agentId,
        names: [character.name || "Eliza"],
        agentId,
        metadata: { name: character.name || "Eliza" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !msg.toLowerCase().includes("duplicate") &&
        !msg.toLowerCase().includes("unique constraint")
      )
        throw e;
    }
  }

  private ensureRuntimeLogger(runtime: AgentRuntime): void {
    if (!runtime.logger?.log) {
      runtime.logger = {
        log: logger.info.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
        success: (message: string) => logger.info(`✓ ${message}`),
        notice: console.info.bind(console),
      } as Logger & { notice: typeof console.info };
    }
  }

  private initializeLoggers(): void {
    if (elizaLogger) {
      elizaLogger.log = logger.info.bind(console);
      elizaLogger.info = console.info.bind(console);
      elizaLogger.warn = console.warn.bind(console);
      elizaLogger.error = console.error.bind(console);
      elizaLogger.debug = console.debug.bind(console);
      elizaLogger.success = (
        obj: string | Error | Record<string, unknown>,
        msg?: string,
      ) => {
        logger.info(typeof obj === "string" ? `✓ ${obj}` : ["✓", obj, msg]);
      };
    }

    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        level: "info",
        log: logger.info.bind(console),
        trace: console.trace.bind(console),
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        fatal: console.error.bind(console),
        success: (
          obj: string | Error | Record<string, unknown>,
          msg?: string,
        ) => {
          logger.info(typeof obj === "string" ? `✓ ${obj}` : ["✓", obj, msg]);
        },
        progress: logger.info.bind(console),
        clear: () => console.clear(),
        child: () => globalAny.logger!,
      };
    }
  }

  /** Wait for MCP service if plugin loaded */
  private async waitForMcpServiceIfNeeded(
    runtime: AgentRuntime,
    plugins: Plugin[],
  ): Promise<void> {
    if (!plugins.some((p) => p.name === "mcp")) return;

    type McpService = {
      waitForInitialization?: () => Promise<void>;
      getServers?: () => unknown[];
    };

    // Poll for service (registers async)
    const maxAttempts = 40;
    let mcpService: McpService | null = null;

    for (let i = 0; i < maxAttempts && !mcpService; i++) {
      mcpService = runtime.getService("mcp") as McpService | null;
      if (!mcpService) await new Promise((r) => setTimeout(r, 100));
    }

    if (!mcpService) {
      elizaLogger.warn("[RuntimeFactory] MCP service not available after 4s");
      return;
    }

    if (typeof mcpService.waitForInitialization === "function") {
      await mcpService.waitForInitialization();
    }

    const servers = mcpService.getServers?.();
    if (servers) {
      elizaLogger.info(
        `[RuntimeFactory] MCP: ${servers.length} server(s) connected`,
      );
    }
  }
}

// Export singleton instance for convenience
export const runtimeFactory = RuntimeFactory.getInstance();
