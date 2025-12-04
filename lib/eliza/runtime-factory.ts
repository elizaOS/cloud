/**
 * Runtime Factory - Creates configured ElizaOS runtimes for users
 * Uses ElizaOS.addAgents() for unified runtime creation (serverless pattern)
 */

import {
  ElizaOS,
  stringToUuid,
  elizaLogger,
  type UUID,
  type Character,
  type IDatabaseAdapter,
  type IAgentRuntime,
  type Logger,
} from "@elizaos/core";
// @ts-expect-error - Type definitions missing in published package
import { createDatabaseAdapter } from "@elizaos/plugin-sql/node";
import { agentLoader } from "./agent-loader";
import { getElizaCloudApiUrl, getDefaultModels } from "./config";
import { userContextService, type UserContext } from "./user-context";
import { AgentMode } from "./agent-mode-types";
import { logger } from "@/lib/utils/logger";

// Initialize DOM polyfills first (before any imports that might need them)
import "@/lib/polyfills/dom-polyfills";

interface GlobalWithEliza {
  __elizaDatabaseAdapter?: IDatabaseAdapter; // Keep DB adapter cached (connections are safe to share)
  __elizaOS?: ElizaOS; // Keep ElizaOS instance cached
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
   * Get or create ElizaOS instance (cached globally for warm containers)
   */
  getElizaOS(): ElizaOS {
    if (!globalAny.__elizaOS) {
      globalAny.__elizaOS = new ElizaOS();
    }
    return globalAny.__elizaOS;
  }

  /**
   * Create a configured runtime for a specific user context
   * Uses ElizaOS.addAgents() with ephemeral mode for serverless
   */
  async createRuntimeForUser(context: UserContext): Promise<IAgentRuntime> {
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

    elizaLogger.info(
      "[RuntimeFactory] Creating runtime via ElizaOS.addAgents() with plugins:",
      plugins.map((p) => p.name).join(", "),
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

    // 5. Use ElizaOS.addAgents() with serverless options
    // Note: plugin-sql is auto-filtered when databaseAdapter is provided
    const elizaOS = this.getElizaOS();
    const [runtime] = await elizaOS.addAgents(
      [
        {
          character: {
            ...character,
            id: agentId,
            settings,
          },
          plugins,
          settings,
          databaseAdapter: dbAdapter,
        },
      ],
      {
        ephemeral: true, // Don't store in registry (serverless)
        skipMigrations: true, // Warm container, migrations already done
        autoStart: true, // Initialize automatically
        returnRuntimes: true, // Return runtime instead of UUID
      },
    );

    // 7. Ensure runtime has logger
    this.ensureRuntimeLogger(runtime);

    // Debug: Check if MCP service was registered and wait for it to connect
    const mcpService = runtime.getService("mcp");
    if (mcpService) {
      elizaLogger.success(
        "[RuntimeFactory] MCP service successfully registered and available",
      );

      // Wait for MCP initialization to complete
      if (typeof (mcpService as any).waitForInitialization === "function") {
        elizaLogger.info(
          "[RuntimeFactory] Waiting for MCP service to finish connecting...",
        );
        await (mcpService as any).waitForInitialization();
        elizaLogger.info(
          "[RuntimeFactory] MCP service initialization complete",
        );
      }

      // Check if servers are connected
      const servers = (mcpService as any).getServers?.();
      if (servers) {
        elizaLogger.info(
          `[RuntimeFactory] MCP servers status: ${JSON.stringify(servers.map((s: any) => ({ name: s.name, status: s.status, toolCount: s.tools?.length || 0 })))}`,
        );
      }
      // Check provider data
      const providerData = (mcpService as any).getProviderData?.();
      const serverKeys = providerData?.data?.mcp
        ? Object.keys(providerData.data.mcp)
        : [];
      elizaLogger.info(
        `[RuntimeFactory] MCP provider has ${serverKeys.length} server(s): ${JSON.stringify(serverKeys)}`,
      );
    } else {
      elizaLogger.error(
        "[RuntimeFactory] MCP service NOT found after initialization!",
      );
    }

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
   * Get a system runtime for operations that don't need user-specific billing
   * Uses system credentials via createSystemContext()
   * Suitable for: GET operations, internal queries, admin tasks
   * For message sending (with billing), use createRuntimeForUser() with user context
   */
  async getSystemRuntime(characterId?: string): Promise<IAgentRuntime> {
    const systemContext = userContextService.createSystemContext(AgentMode.CHAT);
    if (characterId) {
      systemContext.characterId = characterId;
    }
    return this.createRuntimeForUser(systemContext);
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
    
    for (const [serverId, serverConfig] of Object.entries(mcpSettings.servers)) {
      const config = serverConfig as any;
      transformedServers[serverId] = {
        ...config,
        // If URL starts with /, prepend baseUrl; otherwise use as-is
        url: config.url?.startsWith("/") ? `${baseUrl}${config.url}` : config.url,
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
   * Ensure runtime has a properly configured logger
   */
  private ensureRuntimeLogger(runtime: IAgentRuntime): void {
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
}

// Export singleton instance for convenience
export const runtimeFactory = RuntimeFactory.getInstance();
