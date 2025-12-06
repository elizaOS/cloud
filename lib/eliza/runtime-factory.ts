/**
 * Runtime Factory - Creates configured ElizaOS runtimes for users
 * Handles all runtime initialization, plugin loading, and settings configuration
 */

import {
  AgentRuntime,
  stringToUuid,
  elizaLogger,
  type UUID,
  type Agent,
  type Character,
  type Plugin,
  type IDatabaseAdapter,
  type Logger,
} from "@elizaos/core";
// @ts-expect-error - Type definitions missing in published package
import { createDatabaseAdapter } from "@elizaos/plugin-sql/node";
import { agentLoader } from "./agent-loader";
import { getElizaCloudApiUrl, getDefaultModels } from "./config";
import type { UserContext } from "./user-context";
import { logger } from "@/lib/utils/logger";

// Initialize DOM polyfills first (before any imports that might need them)
import "@/lib/polyfills/dom-polyfills";

interface GlobalWithEliza {
  __elizaDatabaseAdapter?: IDatabaseAdapter; // Keep DB adapter cached (connections are safe to share)
  logger?: Logger;
}

const globalAny = globalThis as GlobalWithEliza;

export class RuntimeFactory {
  private static instance: RuntimeFactory;

  // Default agent ID for characters without an ID (backward compatibility)
  private readonly DEFAULT_AGENT_ID = stringToUuid(
    "b850bc30-45f8-0041-a00a-83df46d8555d",
  ) as UUID;

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
   * Create a configured runtime for a specific user context
   * All configuration happens here, no late injection needed
   */
  async createRuntimeForUser(context: UserContext): Promise<AgentRuntime> {
    elizaLogger.info(
      "[RuntimeFactory] Creating runtime for user",
      context.userId,
      "anonymous:",
      context.isAnonymous,
      "agentMode:",
      context.agentMode,
      "characterId:",
      context.characterId || "default",
    );

    // 1. Get or create database adapter (cached, safe to share)
    const dbAdapter = await this.getDbAdapter();

    // 2. Load character with appropriate plugins for the AgentMode
    const { character, plugins } = context.characterId
      ? await agentLoader.loadCharacter(context.characterId, context.agentMode)
      : await agentLoader.getDefaultCharacter(context.agentMode);

    // 3. Extract agentId from character (use character's ID or default)
    const agentId = (
      character.id ? stringToUuid(character.id) : this.DEFAULT_AGENT_ID
    ) as UUID;

    elizaLogger.info(
      "[RuntimeFactory] Loaded character:",
      character.name,
      "| ID:",
      agentId,
      "| Username:",
      character.username || "N/A",
      "| AgentMode:",
      context.agentMode,
      "| Bio:",
      Array.isArray(character.bio)
        ? character.bio[0]
        : character.bio?.toString().substring(0, 100),
    );

    // 4. Build complete settings upfront with user context
    const settings = this.buildSettings(character, context);

    // 5. Filter out plugin-sql since we provide our own adapter
    const filteredPlugins = this.filterPlugins(plugins);

    elizaLogger.info(
      "[RuntimeFactory] Creating AgentRuntime with plugins:",
      filteredPlugins.map((p) => p.name).join(", "),
    );

    // Debug: Log MCP settings being passed to runtime
    if (settings.mcp) {
      elizaLogger.info(
        "[RuntimeFactory] MCP settings found:",
        JSON.stringify(settings.mcp, null, 2),
      );
    } else {
      elizaLogger.warn(
        "[RuntimeFactory] NO MCP settings found in runtime settings!",
      );
    }

    console.log("NEW RUNTIME CREATION");

    // 6. Create runtime with everything configured upfront
    const runtime = new AgentRuntime({
      character: {
        ...character,
        id: agentId, // Use character's own ID
        settings, // All settings including API key are here
      },
      plugins: filteredPlugins,
      agentId: agentId, // Use character's own ID
      settings,
    });

    // 7. Register database adapter
    runtime.registerDatabaseAdapter(dbAdapter);

    // 8. Ensure runtime has logger
    this.ensureRuntimeLogger(runtime);

    // 9. Initialize runtime
    await this.initializeRuntime(runtime, character, agentId);

    // 10. Wait for MCP service if plugin was loaded
    // Why: Assistant mode requires MCP service to work at full capacity
    // Where: Only runs if @elizaos/plugin-mcp is in the plugins list
    // What: Polls until service is available, then waits for initialization
    await this.waitForMcpServiceIfNeeded(runtime, filteredPlugins);

    elizaLogger.success(
      "[RuntimeFactory] Runtime created successfully for user",
      context.userId,
      "with character:",
      character.name,
      "| agentId:",
      agentId,
      "| mode:",
      context.agentMode,
    );

    return runtime;
  }

  /**
   * Transform MCP settings by expanding pathname URLs to full URLs
   * Pathnames (starting with /) get the baseUrl prepended
   * Full URLs are left unchanged
   */
  private transformMcpSettings(mcpSettings: any): any {
    if (!mcpSettings?.servers) {
      return mcpSettings;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const transformedServers: Record<string, any> = {};

    for (const [serverId, serverConfig] of Object.entries(
      mcpSettings.servers,
    )) {
      const config = serverConfig as any;
      transformedServers[serverId] = {
        ...config,
        // If URL starts with /, prepend baseUrl; otherwise use as-is
        url: config.url?.startsWith("/")
          ? `${baseUrl}${config.url}`
          : config.url,
      };
    }

    return {
      ...mcpSettings,
      servers: transformedServers,
    };
  }

  /**
   * Build complete settings object with user context
   * This is where all configuration merging happens
   */
  private buildSettings(
    character: Character,
    context: UserContext,
  ): Record<string, any> {
    // Merge character settings first, then override with runtime values
    // This ensures user preferences (like model selection) take precedence
    const settings = {
      // Merge any custom settings from character first
      ...character.settings,

      // Database configuration (always from environment, cannot be overridden)
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,

      // User-specific ElizaCloud configuration (OVERRIDES character settings)
      // This allows users to select different models via the UI dropdown
      ELIZAOS_CLOUD_API_KEY: context.apiKey,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELIZAOS_CLOUD_SMALL_MODEL:
        context.modelPreferences?.smallModel ||
        (character.settings?.ELIZAOS_CLOUD_SMALL_MODEL as string) ||
        getDefaultModels().small,
      ELIZAOS_CLOUD_LARGE_MODEL:
        context.modelPreferences?.largeModel ||
        (character.settings?.ELIZAOS_CLOUD_LARGE_MODEL as string) ||
        getDefaultModels().large,

      // ElevenLabs settings from character or environment
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY!,
      ELEVENLABS_VOICE_ID:
        (character.settings?.ELEVENLABS_VOICE_ID as string) ||
        process.env.ELEVENLABS_VOICE_ID ||
        "EXAVITQu4vr4xnSDxMaL",
      ELEVENLABS_MODEL_ID:
        (character.settings?.ELEVENLABS_MODEL_ID as string) ||
        process.env.ELEVENLABS_MODEL_ID ||
        "eleven_multilingual_v2",
      ELEVENLABS_VOICE_STABILITY:
        (character.settings?.ELEVENLABS_VOICE_STABILITY as string) ||
        process.env.ELEVENLABS_VOICE_STABILITY ||
        "0.5",
      ELEVENLABS_VOICE_SIMILARITY_BOOST:
        (character.settings?.ELEVENLABS_VOICE_SIMILARITY_BOOST as string) ||
        process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ||
        "0.75",
      ELEVENLABS_VOICE_STYLE:
        (character.settings?.ELEVENLABS_VOICE_STYLE as string) ||
        process.env.ELEVENLABS_VOICE_STYLE ||
        "0",
      ELEVENLABS_VOICE_USE_SPEAKER_BOOST:
        (character.settings?.ELEVENLABS_VOICE_USE_SPEAKER_BOOST as string) ||
        process.env.ELEVENLABS_VOICE_USE_SPEAKER_BOOST ||
        "true",
      ELEVENLABS_OPTIMIZE_STREAMING_LATENCY:
        (character.settings?.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY as string) ||
        process.env.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY ||
        "0",
      ELEVENLABS_OUTPUT_FORMAT:
        (character.settings?.ELEVENLABS_OUTPUT_FORMAT as string) ||
        process.env.ELEVENLABS_OUTPUT_FORMAT ||
        "mp3_44100_128",
      ELEVENLABS_LANGUAGE_CODE:
        (character.settings?.ELEVENLABS_LANGUAGE_CODE as string) ||
        process.env.ELEVENLABS_LANGUAGE_CODE ||
        "en",

      // ElevenLabs STT settings
      ELEVENLABS_STT_MODEL_ID:
        (character.settings?.ELEVENLABS_STT_MODEL_ID as string) ||
        process.env.ELEVENLABS_STT_MODEL_ID ||
        "scribe_v1",
      ELEVENLABS_STT_LANGUAGE_CODE:
        (character.settings?.ELEVENLABS_STT_LANGUAGE_CODE as string) ||
        process.env.ELEVENLABS_STT_LANGUAGE_CODE ||
        "en",
      ELEVENLABS_STT_TIMESTAMPS_GRANULARITY:
        (character.settings?.ELEVENLABS_STT_TIMESTAMPS_GRANULARITY as string) ||
        process.env.ELEVENLABS_STT_TIMESTAMPS_GRANULARITY ||
        "word",
      ELEVENLABS_STT_DIARIZE:
        (character.settings?.ELEVENLABS_STT_DIARIZE as string) ||
        process.env.ELEVENLABS_STT_DIARIZE ||
        "false",
      ...(character.settings?.ELEVENLABS_STT_NUM_SPEAKERS ||
      process.env.ELEVENLABS_STT_NUM_SPEAKERS
        ? {
            ELEVENLABS_STT_NUM_SPEAKERS:
              character.settings?.ELEVENLABS_STT_NUM_SPEAKERS ||
              process.env.ELEVENLABS_STT_NUM_SPEAKERS,
          }
        : {}),
      ELEVENLABS_STT_TAG_AUDIO_EVENTS:
        (character.settings?.ELEVENLABS_STT_TAG_AUDIO_EVENTS as string) ||
        process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS ||
        "false",

      // MCP Plugin Settings - Pass through MCP server configurations
      // Transform pathnames to full URLs for the current environment
      ...(character.settings?.mcp
        ? {
            mcp: this.transformMcpSettings(character.settings.mcp),
          }
        : {}),

      // User metadata for tracking (useful for debugging and analytics)
      USER_ID: context.userId,
      ENTITY_ID: context.entityId,
      ORGANIZATION_ID: context.organizationId,
      IS_ANONYMOUS: context.isAnonymous,
    };

    logger.debug(
      "[RuntimeFactory] Built settings for user",
      context.userId,
      "with models:",
      settings.ELIZAOS_CLOUD_SMALL_MODEL,
      "/",
      settings.ELIZAOS_CLOUD_LARGE_MODEL,
      "| API key:",
      settings.ELIZAOS_CLOUD_API_KEY?.substring(0, 12) + "...",
    );

    return settings;
  }

  /**
   * Get or create database adapter (cached globally, safe to share)
   */
  private async getDbAdapter(): Promise<IDatabaseAdapter> {
    if (globalAny.__elizaDatabaseAdapter) {
      elizaLogger.info("[RuntimeFactory] Reusing cached database adapter");
      return globalAny.__elizaDatabaseAdapter;
    }

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    elizaLogger.info("[RuntimeFactory] Creating new database adapter");
    // Use DEFAULT_AGENT_ID for the database adapter (shared across all characters)
    const dbAdapter = createDatabaseAdapter(
      { postgresUrl: process.env.DATABASE_URL },
      this.DEFAULT_AGENT_ID,
    );

    await dbAdapter.init();
    elizaLogger.info("[RuntimeFactory] Database adapter initialized");

    // Cache globally for warm containers (connection pooling is safe)
    globalAny.__elizaDatabaseAdapter = dbAdapter;
    return dbAdapter;
  }

  /**
   * Filter out plugin-sql since we provide our own adapter
   */
  private filterPlugins(plugins: Plugin[]): Plugin[] {
    return plugins.filter((p) => p.name !== "@elizaos/plugin-sql") as Plugin[];
  }

  /**
   * Initialize runtime with error handling for existing records
   */
  private async initializeRuntime(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    try {
      elizaLogger.info("[RuntimeFactory] Starting runtime initialization...");

      try {
        await runtime.initialize({ skipMigrations: true });
        elizaLogger.success(
          "[RuntimeFactory] Runtime initialized successfully",
        );
      } catch (initError) {
        const errorMsg =
          initError instanceof Error ? initError.message : String(initError);

        // Handle duplicate key errors gracefully (records already exist)
        if (
          errorMsg.includes("Failed to create entity") ||
          errorMsg.includes("Failed to create agent") ||
          errorMsg.toLowerCase().includes("duplicate key") ||
          errorMsg.toLowerCase().includes("unique constraint")
        ) {
          elizaLogger.warn(
            "[RuntimeFactory] Agent/entity records already exist, continuing",
          );
        } else {
          throw initError;
        }
      }

      // Verify agent exists
      const agentExists = await runtime.getAgent(agentId);
      if (!agentExists) {
        elizaLogger.info("[RuntimeFactory] Creating agent entity...");
        await this.ensureAgentExists(runtime, character, agentId);
      }
    } catch (error) {
      elizaLogger.error(
        "[RuntimeFactory] Runtime initialization failed:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Ensure agent entity exists in database
   */
  private async ensureAgentExists(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    try {
      await runtime.ensureAgentExists({
        id: agentId,
        name: character.name || "Eliza",
        username: character.username,
        system: character.system || "",
        bio: character.bio || [],
        messageExamples: character.messageExamples || [],
        postExamples: character.postExamples || [],
        topics: character.topics || [],
        adjectives: character.adjectives || [],
        knowledge: character.knowledge || [],
        plugins: character.plugins || [],
        settings: character.settings || {},
        style: character.style || {},
      } as Agent);

      // Also ensure entity exists
      await runtime.createEntity({
        id: agentId,
        agentId: agentId,
        names: [character.name || "Eliza"],
        metadata: { name: character.name || "Eliza" },
      });
    } catch (entityError) {
      const msg =
        entityError instanceof Error
          ? entityError.message
          : String(entityError);
      if (
        msg.toLowerCase().includes("duplicate key") ||
        msg.toLowerCase().includes("unique constraint")
      ) {
        elizaLogger.warn("[RuntimeFactory] Agent entity already exists");
      } else {
        throw entityError;
      }
    }
  }

  /**
   * Ensure runtime has a properly configured logger
   */
  private ensureRuntimeLogger(runtime: AgentRuntime): void {
    if (!runtime.logger || !runtime.logger.log) {
      runtime.logger = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
        success: (message: string) => console.log(`✓ ${message}`),
        notice: console.info.bind(console),
      } as Logger & { notice: typeof console.info };
    }
  }

  /**
   * Initialize ElizaLogger and global logger
   */
  private initializeLoggers(): void {
    // Configure elizaLogger
    if (elizaLogger) {
      elizaLogger.log = console.log.bind(console);
      elizaLogger.info = console.info.bind(console);
      elizaLogger.warn = console.warn.bind(console);
      elizaLogger.error = console.error.bind(console);
      elizaLogger.debug = console.debug.bind(console);
      elizaLogger.success = (
        obj: string | Error | Record<string, unknown>,
        msg?: string,
      ) => {
        if (typeof obj === "string") {
          console.log(`✓ ${obj}`);
        } else {
          console.log("✓", obj, msg);
        }
      };
      if ("notice" in elizaLogger) {
        (elizaLogger as Logger & { notice: typeof console.info }).notice =
          console.info.bind(console);
      }
    }

    // Configure global logger if needed
    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        level: "info",
        log: console.log.bind(console),
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
          if (typeof obj === "string") {
            console.log(`✓ ${obj}`);
          } else {
            console.log("✓", obj, msg);
          }
        },
        progress: console.log.bind(console),
        clear: () => console.clear(),
        child: () => globalAny.logger!,
      };
    }
  }

  /**
   * Wait for MCP service to be available and initialized if the plugin was loaded
   *
   * Why: Assistant mode requires MCP service for full capabilities
   * When: Only if @elizaos/plugin-mcp is in the loaded plugins list
   * What: Polls for service availability (2s timeout), then waits for initialization
   */
  private async waitForMcpServiceIfNeeded(
    runtime: AgentRuntime,
    plugins: Plugin[],
  ): Promise<void> {
    // Check if MCP plugin was loaded
    const hasMcpPlugin = this.isMcpPluginLoaded(plugins);

    if (!hasMcpPlugin) {
      elizaLogger.info(
        "[RuntimeFactory] MCP plugin not loaded, skipping service check",
      );
      return;
    }

    elizaLogger.info(
      "[RuntimeFactory] MCP plugin loaded, waiting for service to become available...",
    );

    // Poll for service availability (it registers asynchronously during runtime.initialize())
    const mcpService = await this.pollForMcpService(runtime);

    if (!mcpService) {
      elizaLogger.error(
        "[RuntimeFactory] MCP service NOT available after 2s - assistant mode will have limited capabilities!",
      );
      return;
    }

    // Service is available, now wait for it to finish connecting to MCP servers
    await this.waitForMcpInitialization(mcpService);

    // Log final status
    this.logMcpServiceStatus(mcpService);
  }

  /**
   * Check if MCP plugin is in the loaded plugins list
   *
   * Where: Checks plugin names for @elizaos/plugin-mcp
   */
  private isMcpPluginLoaded(plugins: Plugin[]): boolean {
    return plugins.some((p) => p.name === "mcp");
  }

  /**
   * Poll for MCP service to become available
   *
   * Why: Service registers asynchronously, not immediately available after runtime.initialize()
   * What: Checks every 100ms for up to 2000ms (2s)
   */
  private async pollForMcpService(runtime: AgentRuntime): Promise<any | null> {
    const maxAttempts = 40; // 40 attempts * 100ms = 4000ms (4s)
    const pollInterval = 100; // ms

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const service = runtime.getService("mcp");

      if (service) {
        elizaLogger.success(
          `[RuntimeFactory] MCP service became available after ${attempt * pollInterval}ms`,
        );
        return service;
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return null;
  }

  /**
   * Wait for MCP service to finish connecting to configured MCP servers
   *
   * Why: Service needs to establish connections before tools are available
   * What: Calls waitForInitialization() if the method exists
   */
  private async waitForMcpInitialization(mcpService: any): Promise<void> {
    if (typeof mcpService.waitForInitialization !== "function") {
      elizaLogger.warn(
        "[RuntimeFactory] MCP service does not have waitForInitialization method",
      );
      return;
    }

    elizaLogger.info(
      "[RuntimeFactory] Waiting for MCP service to finish connecting to servers...",
    );

    await mcpService.waitForInitialization();

    elizaLogger.success("[RuntimeFactory] MCP service initialization complete");
  }

  /**
   * Log MCP service status for debugging
   *
   * What: Logs connected servers and available tools
   */
  private logMcpServiceStatus(mcpService: any): void {
    // Log server connection status
    const servers = mcpService.getServers?.();
    if (servers) {
      const serverStatus = servers.map((s: any) => ({
        name: s.name,
        status: s.status,
        toolCount: s.tools?.length || 0,
      }));
      elizaLogger.info(
        `[RuntimeFactory] MCP servers: ${JSON.stringify(serverStatus)}`,
      );
    }

    // Log provider data
    const providerData = mcpService.getProviderData?.();
    const serverKeys = providerData?.data?.mcp
      ? Object.keys(providerData.data.mcp)
      : [];
    elizaLogger.info(
      `[RuntimeFactory] MCP provider has ${serverKeys.length} server(s): ${JSON.stringify(serverKeys)}`,
    );
  }
}

// Export singleton instance for convenience
export const runtimeFactory = RuntimeFactory.getInstance();
