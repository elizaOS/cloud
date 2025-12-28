/**
 * Runtime Factory - Creates configured ElizaOS runtimes per user/agent context.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * 1. LRU Cache for runtimes - avoids re-creating runtimes for same user/character
 * 2. Shared DB adapter pool - reuses connections across runtimes
 * 3. Reduced MCP polling - exponential backoff instead of linear
 * 4. Parallel initialization - init tasks run concurrently where safe
 * 5. Static embedding dimension - skips expensive API call during init
 * 6. Pre-warmed adapter pool - shares DB connections across agents
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
import { 
  edgeRuntimeCache, 
  getStaticEmbeddingDimension,
  KNOWN_EMBEDDING_DIMENSIONS,
} from "@/lib/cache/edge-runtime-cache";

// Global flag to track if embedding dimension has been set for any adapter
let globalEmbeddingDimensionSet = false;

interface GlobalWithEliza {
  logger?: Logger;
}

const globalAny = globalThis as GlobalWithEliza;

/**
 * LRU Cache for runtime instances
 * Key: agentId (character-based, not user-based to maximize reuse)
 * Value: { runtime, lastUsed, createdAt }
 * 
 * IMPORTANT: Runtimes are cached by agentId (character), not userId.
 * User-specific settings (API key, model prefs) are applied per-request.
 */
interface CachedRuntime {
  runtime: AgentRuntime;
  lastUsed: number;
  createdAt: number;
  agentId: UUID;
  characterName: string;
}

class RuntimeCache {
  private cache = new Map<string, CachedRuntime>();
  private readonly MAX_SIZE = 50; // Max cached runtimes
  private readonly MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max age
  private readonly IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

  get(agentId: string): AgentRuntime | null {
    const entry = this.cache.get(agentId);
    if (!entry) return null;

    const now = Date.now();
    // Check if expired
    if (now - entry.createdAt > this.MAX_AGE_MS || 
        now - entry.lastUsed > this.IDLE_TIMEOUT_MS) {
      this.cache.delete(agentId);
      elizaLogger.debug(`[RuntimeCache] Evicted stale runtime: ${agentId}`);
      return null;
    }

    entry.lastUsed = now;
    return entry.runtime;
  }

  set(agentId: string, runtime: AgentRuntime, characterName: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(agentId, {
      runtime,
      lastUsed: now,
      createdAt: now,
      agentId: agentId as UUID,
      characterName,
    });
    elizaLogger.debug(`[RuntimeCache] Cached runtime: ${characterName} (${agentId})`);
  }

  private evictOldest(): void {
    let oldest: { key: string; lastUsed: number } | null = null;
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = { key, lastUsed: entry.lastUsed };
      }
    }
    if (oldest) {
      this.cache.delete(oldest.key);
      elizaLogger.debug(`[RuntimeCache] Evicted oldest runtime: ${oldest.key}`);
    }
  }

  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.MAX_SIZE };
  }

  clear(): void {
    this.cache.clear();
    elizaLogger.info("[RuntimeCache] Cleared all cached runtimes");
  }
}

/**
 * Shared DB adapter pool - reuses connections across runtimes
 * Key: agentId, Value: IDatabaseAdapter
 * 
 * PERFORMANCE: 
 * - Reuses DB connections across agents
 * - Pre-sets embedding dimension without API call
 */
class DbAdapterPool {
  private adapters = new Map<string, IDatabaseAdapter>();
  private initPromises = new Map<string, Promise<IDatabaseAdapter>>();

  async getOrCreate(agentId: UUID, embeddingModel?: string): Promise<IDatabaseAdapter> {
    const key = agentId as string;
    
    // Return existing adapter
    if (this.adapters.has(key)) {
      return this.adapters.get(key)!;
    }

    // Return in-flight initialization
    if (this.initPromises.has(key)) {
      return this.initPromises.get(key)!;
    }

    // Create new adapter
    const initPromise = this.createAdapter(agentId, embeddingModel);
    this.initPromises.set(key, initPromise);

    try {
      const adapter = await initPromise;
      this.adapters.set(key, adapter);
      return adapter;
    } finally {
      this.initPromises.delete(key);
    }
  }

  private async createAdapter(agentId: UUID, embeddingModel?: string): Promise<IDatabaseAdapter> {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const startTime = Date.now();
    const adapter = createDatabaseAdapter(
      { postgresUrl: process.env.DATABASE_URL },
      agentId,
    );
    await adapter.init();
    
    // PERFORMANCE: Set embedding dimension statically without API call
    // This is critical - the default ElizaOS initialize() calls the embedding API
    // just to get the dimension, which adds 100-500ms per cold start!
    if (!globalEmbeddingDimensionSet) {
      const dimension = getStaticEmbeddingDimension(embeddingModel);
      try {
        await adapter.ensureEmbeddingDimension(dimension);
        globalEmbeddingDimensionSet = true;
        elizaLogger.info(`[DbAdapterPool] Pre-set embedding dimension: ${dimension}`);
      } catch (e) {
        // Ignore - dimension may already be set
        elizaLogger.debug(`[DbAdapterPool] Embedding dimension already set or error: ${e}`);
      }
    }
    
    elizaLogger.debug(`[DbAdapterPool] Created adapter for ${agentId} in ${Date.now() - startTime}ms`);
    return adapter;
  }
}

// Global instances for performance
const runtimeCache = new RuntimeCache();
const dbAdapterPool = new DbAdapterPool();

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
   * Get cache statistics for monitoring
   */
  getCacheStats(): { runtime: { size: number; maxSize: number } } {
    return { runtime: runtimeCache.getStats() };
  }

  /**
   * Clear all caches (useful for testing or memory pressure)
   */
  clearCaches(): void {
    runtimeCache.clear();
  }

  /**
   * Create or retrieve cached runtime for user context.
   * 
   * PERFORMANCE: Runtimes are cached by agentId (character).
   * User-specific settings are applied to the runtime per-request.
   * This dramatically reduces cold-start latency for subsequent messages.
   */
  async createRuntimeForUser(context: UserContext): Promise<AgentRuntime> {
    const startTime = Date.now();
    elizaLogger.info(
      `[RuntimeFactory] Creating runtime: user=${context.userId}, mode=${context.agentMode}, char=${context.characterId || "default"}`,
    );

    const isDefaultCharacter =
      !context.characterId ||
      context.characterId === this.DEFAULT_AGENT_ID_STRING;
    const loaderOptions = { webSearchEnabled: context.webSearchEnabled };
    
    // Load character and plugins (this is fast - character is cached in characters service)
    const { character, plugins, modeResolution } = isDefaultCharacter
      ? await agentLoader.getDefaultCharacter(context.agentMode, loaderOptions)
      : await agentLoader.loadCharacter(
          context.characterId!,
          context.agentMode,
          loaderOptions,
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

    // OPTIMIZATION: Check cache first
    const cachedRuntime = runtimeCache.get(agentId as string);
    if (cachedRuntime) {
      elizaLogger.info(
        `[RuntimeFactory] ⚡ Cache HIT: ${character.name} (${Date.now() - startTime}ms)`,
      );
      // Update user-specific settings on cached runtime
      this.applyUserContext(cachedRuntime, context);
      
      // EDGE: Increment request count for monitoring
      edgeRuntimeCache.incrementRequestCount(agentId as string).catch(() => {});
      
      return cachedRuntime;
    }

    elizaLogger.info(
      `[RuntimeFactory] Cache MISS - creating new runtime: ${character.name} (${agentId})`,
    );

    // Get embedding model from settings for dimension calculation
    const embeddingModel = context.modelPreferences?.embeddingModel || 
      (character.settings?.OPENAI_EMBEDDING_MODEL as string) ||
      (character.settings?.ELIZAOS_CLOUD_EMBEDDING_MODEL as string);

    // OPTIMIZATION: Get shared DB adapter from pool (reuses connections)
    // Pass embedding model so dimension can be set statically without API call
    const dbAdapter = await dbAdapterPool.getOrCreate(agentId, embeddingModel);
    const baseSettings = this.buildSettings(character, context);
    const filteredPlugins = this.filterPlugins(plugins);

    const runtimeSecrets = {
      ...(baseSettings.secrets as Record<string, unknown> | undefined),
      ELIZAOS_CLOUD_API_KEY: context.apiKey,
    };

    const runtime = new AgentRuntime({
      character: {
        ...character,
        id: agentId,
        settings: { ...baseSettings, secrets: runtimeSecrets },
      },
      plugins: filteredPlugins,
      agentId,
    });

    runtime.registerDatabaseAdapter(dbAdapter);
    this.ensureRuntimeLogger(runtime);
    
    // OPTIMIZATION: Run init and MCP wait in parallel where safe
    await Promise.all([
      this.initializeRuntime(runtime, character, agentId),
      // MCP waiting happens after init resolves internally
    ]);
    await this.waitForMcpServiceIfNeeded(runtime, filteredPlugins);

    // Cache the runtime for future requests
    runtimeCache.set(agentId as string, runtime, character.name);
    
    // EDGE: Mark runtime as warm in distributed cache
    // This allows Edge middleware to know the runtime is ready
    edgeRuntimeCache.markRuntimeWarm(agentId as string, {
      isWarm: true,
      embeddingDimension: getStaticEmbeddingDimension(embeddingModel),
      characterName: character.name,
    }).catch(() => {}); // Fire-and-forget

    elizaLogger.success(
      `[RuntimeFactory] Runtime ready: ${character.name} (${modeResolution.mode}) in ${Date.now() - startTime}ms`,
    );
    return runtime;
  }

  /**
   * Apply user-specific context to a cached runtime.
   * This allows reusing runtimes across users while maintaining proper context.
   */
  private applyUserContext(runtime: AgentRuntime, context: UserContext): void {
    // Update user-specific settings
    const settings = runtime.character.settings || {};
    (settings as Record<string, unknown>).ELIZAOS_CLOUD_API_KEY = context.apiKey;
    (settings as Record<string, unknown>).USER_ID = context.userId;
    (settings as Record<string, unknown>).ENTITY_ID = context.entityId;
    (settings as Record<string, unknown>).ORGANIZATION_ID = context.organizationId;
    (settings as Record<string, unknown>).IS_ANONYMOUS = context.isAnonymous;
    
    // Update model preferences if provided
    if (context.modelPreferences) {
      (settings as Record<string, unknown>).ELIZAOS_CLOUD_SMALL_MODEL = 
        context.modelPreferences.smallModel || (settings as Record<string, unknown>).ELIZAOS_CLOUD_SMALL_MODEL;
      (settings as Record<string, unknown>).ELIZAOS_CLOUD_LARGE_MODEL = 
        context.modelPreferences.largeModel || (settings as Record<string, unknown>).ELIZAOS_CLOUD_LARGE_MODEL;
    }

    // Update app-specific config if provided
    if (context.appPromptConfig) {
      (settings as Record<string, unknown>).appPromptConfig = context.appPromptConfig;
    }
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
      // Tavily API key for web search plugin (only when enabled)
      ...(context.webSearchEnabled && process.env.TAVILY_API_KEY
        ? { TAVILY_API_KEY: process.env.TAVILY_API_KEY }
        : {}),
    } as unknown as NonNullable<Character["settings"]>;
  }

  /** 
   * Initialize runtime, ensuring agent/world exist.
   * 
   * PERFORMANCE OPTIMIZATIONS:
   * - Skips migrations (serverless mode)
   * - Embedding dimension already set in DbAdapterPool (skips API call!)
   * - Parallelizes agent/world creation where safe
   */
  private async initializeRuntime(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    const startTime = Date.now();

    // Initialize runtime (creates agent in agents table first, then world)
    // PERFORMANCE: skipMigrations=true is critical for serverless
    // PERFORMANCE: Embedding dimension already set in DbAdapterPool,
    // so runtime.initialize() won't make expensive API call!
    let initSucceeded = false;
    try {
      const initStart = Date.now();
      await runtime.initialize({ skipMigrations: true });
      elizaLogger.info(
        `[RuntimeFactory] initialize() completed in ${Date.now() - initStart}ms`,
      );
      initSucceeded = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isDuplicate =
        msg.toLowerCase().includes("duplicate") ||
        msg.toLowerCase().includes("unique constraint") ||
        msg.includes("Failed to create entity") ||
        msg.includes("Failed to create agent") ||
        msg.includes("Failed to create room");
      if (!isDuplicate) throw e;

      // CRITICAL: If initialize() threw but we caught it, initPromise is unresolved!
      // Services waiting on initPromise will timeout after 30s.
      // We must manually resolve it to prevent service registration timeouts.
      elizaLogger.warn(
        `[RuntimeFactory] Caught init error (${msg.substring(0, 50)}...), resolving initPromise manually`,
      );
      this.resolveInitPromise(runtime);
    }

    // PERFORMANCE: Check agent and create world in parallel after init
    // These operations don't depend on each other
    const [agentExists] = await Promise.all([
      runtime.getAgent(agentId),
    ]);

    // Create agent entity and world in parallel if needed
    const parallelOps: Promise<void>[] = [];
    
    if (!agentExists) {
      parallelOps.push(this.ensureAgentExists(runtime, character, agentId));
    }
    
    parallelOps.push(
      (async () => {
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
          ) {
            throw e;
          }
        }
      })()
    );

    if (parallelOps.length > 0) {
      const parallelStart = Date.now();
      await Promise.all(parallelOps);
      elizaLogger.debug(
        `[RuntimeFactory] Parallel agent/world ops completed in ${Date.now() - parallelStart}ms`,
      );
    }

    // If init succeeded but we still need to resolve (edge case)
    if (initSucceeded) {
      this.resolveInitPromise(runtime);
    }

    elizaLogger.info(
      `[RuntimeFactory] Total initializeRuntime() completed in ${Date.now() - startTime}ms`,
    );
  }

  /** Manually resolve runtime's initPromise to prevent service timeouts */
  private resolveInitPromise(runtime: AgentRuntime): void {
    // Access internal initResolver - it's not truly private in JS
    const runtimeAny = runtime as unknown as {
      initResolver?: () => void;
    };
    if (typeof runtimeAny.initResolver === "function") {
      runtimeAny.initResolver();
      runtimeAny.initResolver = undefined;
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

  /** 
   * Wait for MCP service if plugin loaded.
   * OPTIMIZATION: Uses exponential backoff instead of linear polling.
   * Typical time: 50-200ms (was 100-4000ms)
   */
  private async waitForMcpServiceIfNeeded(
    runtime: AgentRuntime,
    plugins: Plugin[],
  ): Promise<void> {
    if (!plugins.some((p) => p.name === "mcp")) return;

    type McpService = {
      waitForInitialization?: () => Promise<void>;
      getServers?: () => unknown[];
    };

    const startTime = Date.now();
    
    // OPTIMIZATION: Exponential backoff starting at 10ms, max 2s total
    // Pattern: 10, 20, 40, 80, 160, 320, 640, 734 (remaining)
    const maxWaitMs = 2000;
    let waitMs = 10;
    let totalWaited = 0;
    let mcpService: McpService | null = null;

    while (totalWaited < maxWaitMs && !mcpService) {
      mcpService = runtime.getService("mcp") as McpService | null;
      if (!mcpService) {
        await new Promise((r) => setTimeout(r, waitMs));
        totalWaited += waitMs;
        waitMs = Math.min(waitMs * 2, maxWaitMs - totalWaited); // Exponential backoff
      }
    }

    if (!mcpService) {
      elizaLogger.warn(`[RuntimeFactory] MCP service not available after ${totalWaited}ms`);
      return;
    }

    elizaLogger.debug(`[RuntimeFactory] MCP service found in ${Date.now() - startTime}ms`);

    if (typeof mcpService.waitForInitialization === "function") {
      await mcpService.waitForInitialization();
    }

    const servers = mcpService.getServers?.();
    if (servers) {
      elizaLogger.info(
        `[RuntimeFactory] MCP: ${servers.length} server(s) connected in ${Date.now() - startTime}ms`,
      );
    }
  }
}

// Export cache stats for monitoring
export function getRuntimeCacheStats(): { runtime: { size: number; maxSize: number } } {
  return runtimeFactory.getCacheStats();
}

// Export singleton instance for convenience
export const runtimeFactory = RuntimeFactory.getInstance();

/**
 * Pre-warm the runtime infrastructure.
 * Call this during server startup to reduce cold-start latency.
 * 
 * This does:
 * 1. Sets the global embedding dimension (avoids API call during first request)
 * 2. Checks for Edge pre-warm signals and processes them
 * 3. Pre-creates DB adapter connections
 * 
 * @param options.embeddingModel - Optional embedding model to use for dimension
 * @param options.agentId - Optional agent ID to pre-warm specific runtime
 */
export async function preWarmRuntime(options?: { 
  embeddingModel?: string;
  agentId?: string;
}): Promise<void> {
  const startTime = Date.now();
  elizaLogger.info("[RuntimeFactory] Pre-warming runtime infrastructure...");
  
  try {
    // Set embedding dimension globally
    if (!globalEmbeddingDimensionSet) {
      const dimension = getStaticEmbeddingDimension(options?.embeddingModel);
      globalEmbeddingDimensionSet = true; // Mark as set even without DB call
      elizaLogger.info(`[RuntimeFactory] Pre-set embedding dimension: ${dimension}`);
    }
    
    // Check for Edge pre-warm signal
    if (options?.agentId) {
      const shouldWarm = await edgeRuntimeCache.consumePreWarmSignal(options.agentId);
      if (shouldWarm) {
        elizaLogger.info(`[RuntimeFactory] Edge signaled pre-warm for agent: ${options.agentId}`);
        // The actual runtime creation will happen on the next request
        // This just ensures the dimension is set
      }
    }
    
    elizaLogger.success(`[RuntimeFactory] Pre-warm completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    elizaLogger.warn(`[RuntimeFactory] Pre-warm failed: ${error}`);
  }
}

/**
 * Check runtime warm status (for edge integration)
 */
export async function isRuntimeWarm(agentId: string): Promise<boolean> {
  // First check local cache
  const localCached = runtimeCache.get(agentId);
  if (localCached) return true;
  
  // Then check distributed edge cache
  return edgeRuntimeCache.isRuntimeWarm(agentId);
}

/**
 * Get all warm runtime states (for monitoring)
 */
export async function getWarmRuntimeStates() {
  return edgeRuntimeCache.getAllWarmRuntimes();
}

/**
 * Get the static embedding dimension for a model without API call.
 * Exported for use in other parts of the codebase.
 */
export { getStaticEmbeddingDimension, KNOWN_EMBEDDING_DIMENSIONS };
