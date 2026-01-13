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
import {
  getElizaCloudApiUrl,
  getDefaultModels,
  buildElevenLabsSettings,
} from "./config";
import { DEFAULT_IMAGE_MODEL } from "@/lib/models";
import type { UserContext } from "./user-context";
import { logger } from "@/lib/utils/logger";
import "@/lib/polyfills/dom-polyfills";
import {
  edgeRuntimeCache,
  getStaticEmbeddingDimension,
  KNOWN_EMBEDDING_DIMENSIONS,
} from "@/lib/cache/edge-runtime-cache";

const adapterEmbeddingDimensions = new Map<string, number>();

interface GlobalWithEliza {
  logger?: Logger;
}

interface RuntimeSettings {
  ELIZAOS_CLOUD_API_KEY?: string;
  USER_ID?: string;
  ENTITY_ID?: string;
  ORGANIZATION_ID?: string;
  IS_ANONYMOUS?: boolean;
  ELIZAOS_CLOUD_SMALL_MODEL?: string;
  ELIZAOS_CLOUD_LARGE_MODEL?: string;
  ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL?: string;
  appPromptConfig?: unknown;
  [key: string]: unknown;
}

const globalAny = globalThis as GlobalWithEliza;

interface CachedRuntime {
  runtime: AgentRuntime;
  lastUsed: number;
  createdAt: number;
  agentId: UUID;
  characterName: string;
}

const safeClose = async (
  closeable: { close(): Promise<void> },
  label: string,
  id: string,
): Promise<void> => {
  await closeable
    .close()
    .catch((e) => elizaLogger.debug(`[${label}] Close error for ${id}: ${e}`));
};

class RuntimeCache {
  private cache = new Map<string, CachedRuntime>();
  private readonly MAX_SIZE = 50; // Max cached runtimes
  private readonly MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max age
  private readonly IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

  async get(agentId: string): Promise<AgentRuntime | null> {
    const entry = this.cache.get(agentId);
    if (!entry) return null;

    const now = Date.now();
    if (
      now - entry.createdAt > this.MAX_AGE_MS ||
      now - entry.lastUsed > this.IDLE_TIMEOUT_MS
    ) {
      await safeClose(entry.runtime, "RuntimeCache", agentId);
      this.cache.delete(agentId);
      elizaLogger.debug(`[RuntimeCache] Evicted stale runtime: ${agentId}`);
      return null;
    }

    entry.lastUsed = now;
    return entry.runtime;
  }

  async getWithHealthCheck(
    agentId: string,
    dbPool: DbAdapterPool,
  ): Promise<AgentRuntime | null> {
    const entry = this.cache.get(agentId);
    if (!entry) return null;

    const now = Date.now();
    if (
      now - entry.createdAt > this.MAX_AGE_MS ||
      now - entry.lastUsed > this.IDLE_TIMEOUT_MS
    ) {
      await safeClose(entry.runtime, "RuntimeCache", agentId);
      this.cache.delete(agentId);
      elizaLogger.debug(`[RuntimeCache] Evicted stale runtime: ${agentId}`);
      return null;
    }

    const isHealthy = await dbPool.checkHealth(entry.agentId as UUID);
    if (!isHealthy) {
      await safeClose(entry.runtime, "RuntimeCache", agentId);
      this.cache.delete(agentId);
      elizaLogger.debug(`[RuntimeCache] Evicted unhealthy runtime: ${agentId}`);
      return null;
    }

    entry.lastUsed = now;
    return entry.runtime;
  }

  async set(
    cacheKey: string,
    runtime: AgentRuntime,
    characterName: string,
    actualAgentId: UUID,
  ): Promise<void> {
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_SIZE) {
      await this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(cacheKey, {
      runtime,
      lastUsed: now,
      createdAt: now,
      agentId: actualAgentId,
      characterName,
    });
    elizaLogger.debug(
      `[RuntimeCache] Cached runtime: ${characterName} (${actualAgentId}, key=${cacheKey})`,
    );
  }

  /**
   * Remove a runtime from cache WITHOUT closing it.
   * Use this for invalidation - the runtime's services are stopped but
   * the database adapter is NOT closed (it shares a global connection pool).
   */
  async remove(agentId: string): Promise<boolean> {
    const entry = this.cache.get(agentId);
    if (entry) {
      // Stop services but DON'T close the adapter
      // runtime.stop() stops services without closing the database
      try {
        await entry.runtime.stop();
      } catch (e) {
        elizaLogger.debug(`[RuntimeCache] Stop error for ${agentId}: ${e}`);
      }
      this.cache.delete(agentId);
      elizaLogger.info(`[RuntimeCache] Removed runtime: ${agentId} (adapter kept alive)`);
      return true;
    }
    return false;
  }

  /**
   * Delete a runtime from cache AND close it completely.
   * Use this only for full shutdown scenarios where you want to terminate
   * the database connection.
   */
  async delete(agentId: string): Promise<boolean> {
    const entry = this.cache.get(agentId);
    if (entry) {
      await safeClose(entry.runtime, "RuntimeCache", agentId);
      this.cache.delete(agentId);
      elizaLogger.info(`[RuntimeCache] Deleted runtime: ${agentId} (fully closed)`);
      return true;
    }
    return false;
  }

  has(agentId: string): boolean {
    return this.cache.has(agentId);
  }

  private async evictOldest(): Promise<void> {
    let oldest: { key: string; lastUsed: number } | null = null;
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = { key, lastUsed: entry.lastUsed };
      }
    }
    if (oldest) {
      const entry = this.cache.get(oldest.key);
      if (entry) {
        await safeClose(entry.runtime, "RuntimeCache", oldest.key);
      }
      this.cache.delete(oldest.key);
    }
  }

  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.MAX_SIZE };
  }

  async clear(): Promise<void> {
    await Promise.all(
      Array.from(this.cache.entries()).map(([id, entry]) =>
        safeClose(entry.runtime, "RuntimeCache", id),
      ),
    );
    this.cache.clear();
  }
}

class DbAdapterPool {
  private adapters = new Map<string, IDatabaseAdapter>();
  private initPromises = new Map<string, Promise<IDatabaseAdapter>>();

  async getOrCreate(
    agentId: UUID,
    embeddingModel?: string,
    retryCount = 0,
  ): Promise<IDatabaseAdapter> {
    const key = agentId as string;
    const MAX_RETRIES = 2;

    if (this.adapters.has(key)) {
      const existingAdapter = this.adapters.get(key)!;
      const isHealthy = await this.checkAdapterHealth(existingAdapter);
      if (isHealthy) {
        return existingAdapter;
      }

      await safeClose(existingAdapter, "DbAdapterPool", key);
      this.adapters.delete(key);
      adapterEmbeddingDimensions.delete(key);
      elizaLogger.warn(
        `[DbAdapterPool] Stale connection for ${agentId}, recreating`,
      );
    }

    if (this.initPromises.has(key)) {
      return this.initPromises.get(key)!;
    }

    const initPromise = this.createAdapter(agentId, embeddingModel);
    this.initPromises.set(key, initPromise);

    try {
      const adapter = await initPromise;
      this.adapters.set(key, adapter);
      return adapter;
    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      // Retry on connection errors
      if (
        retryCount < MAX_RETRIES &&
        (msg.includes("server conn crashed") ||
          msg.includes("08p01") ||
          msg.includes("fatal") ||
          msg.includes("connection") ||
          msg.includes("socket") ||
          msg.includes("terminated") ||
          msg.includes("end on the pool") ||
          msg.includes("rollback") ||
          msg.includes("failed query") ||
          msg.includes("econnreset"))
      ) {
        elizaLogger.warn(
          `[DbAdapterPool] Adapter creation failed, retrying (${retryCount + 1}/${MAX_RETRIES}): ${msg.substring(0, 100)}`,
        );
        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 200 * Math.pow(2, retryCount)),
        );
        return this.getOrCreate(agentId, embeddingModel, retryCount + 1);
      }
      throw error;
    } finally {
      this.initPromises.delete(key);
    }
  }

  private async checkAdapterHealth(
    adapter: IDatabaseAdapter,
  ): Promise<boolean> {
    try {
      await adapter.getEntitiesByIds([
        "00000000-0000-0000-0000-000000000000" as UUID,
      ]);
      return true;
    } catch (error) {
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      // Check for various connection failure indicators
      // PostgreSQL error code 08P01 = protocol violation (server conn crashed)
      // Also check for common connection error messages
      if (
        msg.includes("closed") ||
        msg.includes("terminated") ||
        msg.includes("connection") ||
        msg.includes("server conn crashed") ||
        msg.includes("08p01") ||
        msg.includes("cannot use a pool") ||
        msg.includes("fatal") ||
        msg.includes("socket") ||
        msg.includes("econnreset") ||
        msg.includes("etimedout") ||
        msg.includes("end on the pool") ||
        msg.includes("rollback") ||
        msg.includes("failed query")
      ) {
        elizaLogger.warn(
          `[DbAdapterPool] Health check failed - connection issue detected: ${msg.substring(0, 100)}`,
        );
        return false;
      }
      // For other errors (like "not found"), the connection is still healthy
      return true;
    }
  }

  async checkHealth(agentId: UUID): Promise<boolean> {
    const key = agentId as string;
    const adapter = this.adapters.get(key);
    if (!adapter) return true;

    const isHealthy = await this.checkAdapterHealth(adapter);
    if (!isHealthy) this.removeAdapter(key);
    return isHealthy;
  }

  private async createAdapter(
    agentId: UUID,
    embeddingModel?: string,
  ): Promise<IDatabaseAdapter> {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const startTime = Date.now();
    const adapter = createDatabaseAdapter(
      { postgresUrl: process.env.DATABASE_URL },
      agentId,
    );
    await adapter.init();

    const key = agentId as string;
    const dimension = getStaticEmbeddingDimension(embeddingModel);
    const existingDimension = adapterEmbeddingDimensions.get(key);

    if (existingDimension !== dimension) {
      try {
        await adapter.ensureEmbeddingDimension(dimension);
        adapterEmbeddingDimensions.set(key, dimension);
        elizaLogger.info(
          `[DbAdapterPool] Set embedding dimension for ${agentId}: ${dimension}`,
        );
      } catch (e) {
        elizaLogger.debug(`[DbAdapterPool] Embedding dimension: ${e}`);
        adapterEmbeddingDimensions.set(key, dimension);
      }
    }

    elizaLogger.debug(
      `[DbAdapterPool] Created adapter for ${agentId} in ${Date.now() - startTime}ms`,
    );
    return adapter;
  }

  /**
   * Remove an adapter from tracking WITHOUT closing it.
   * Use this for invalidation - the adapter shares a global connection pool
   * that should NOT be terminated.
   */
  removeAdapter(agentId: string): void {
    this.adapters.delete(agentId);
    adapterEmbeddingDimensions.delete(agentId);
    elizaLogger.debug(`[DbAdapterPool] Removed adapter reference: ${agentId} (connection pool kept alive)`);
  }

  /**
   * Close and remove an adapter completely.
   * Use this only for full shutdown scenarios.
   * WARNING: This will close the shared connection pool!
   */
  async closeAdapter(agentId: string): Promise<void> {
    const adapter = this.adapters.get(agentId);
    if (adapter) {
      await safeClose(adapter, "DbAdapterPool", agentId);
    }
    this.adapters.delete(agentId);
    adapterEmbeddingDimensions.delete(agentId);
  }

  /**
   * @deprecated Use removeAdapter() for invalidation or closeAdapter() for shutdown.
   * This method closes the adapter which terminates the shared connection pool.
   */
  async invalidateAdapter(agentId: string): Promise<void> {
    // For backward compatibility, but logs a warning
    elizaLogger.warn(
      `[DbAdapterPool] invalidateAdapter() is deprecated - use removeAdapter() instead to avoid closing shared pool`,
    );
    await this.closeAdapter(agentId);
  }
}

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

  getCacheStats(): { runtime: { size: number; maxSize: number } } {
    return { runtime: runtimeCache.getStats() };
  }

  async clearCaches(): Promise<void> {
    await runtimeCache.clear();
  }

  async invalidateRuntime(agentId: string): Promise<boolean> {
    // IMPORTANT: We intentionally DON'T close the adapter here.
    // 
    // The plugin-sql connection pool is a GLOBAL SINGLETON shared by all agents.
    // Calling adapter.close() would terminate the pool for EVERYONE, not just this agent.
    //
    // Instead, we:
    // 1. Remove the runtime from cache (using stop(), not close())
    // 2. Remove the adapter reference from our pool (without closing it)
    // 3. Let garbage collection clean up the orphaned adapter
    // 4. The shared connection pool stays alive for other agents
    //
    // On the next request, a fresh runtime will be created with a new adapter
    // that reuses the same underlying connection pool.

    const wasInMemoryBase = await runtimeCache.remove(agentId);
    const wasInMemoryWs = await runtimeCache.remove(`${agentId}:ws`);
    const wasInMemory = wasInMemoryBase || wasInMemoryWs;

    // Just remove from our tracking - DON'T close the adapter
    dbAdapterPool.removeAdapter(agentId);

    try {
      await edgeRuntimeCache.invalidateCharacter(agentId);
      await edgeRuntimeCache.markRuntimeWarm(agentId, {
        isWarm: false,
        embeddingDimension: 0,
        characterName: undefined,
      });
    } catch (e) {
      elizaLogger.warn(`[RuntimeFactory] Edge cache invalidation failed: ${e}`);
    }

    elizaLogger.info(
      `[RuntimeFactory] Invalidated runtime for agent: ${agentId} (base: ${wasInMemoryBase}, ws: ${wasInMemoryWs})`,
    );

    return wasInMemory;
  }

  isRuntimeCached(agentId: string): boolean {
    return runtimeCache.has(agentId);
  }

  async createRuntimeForUser(context: UserContext): Promise<AgentRuntime> {
    const startTime = Date.now();
    elizaLogger.info(
      `[RuntimeFactory] Creating runtime: user=${context.userId}, mode=${context.agentMode}, char=${context.characterId || "default"}, webSearch=${context.webSearchEnabled}`,
    );

    const isDefaultCharacter =
      !context.characterId ||
      context.characterId === this.DEFAULT_AGENT_ID_STRING;
    const loaderOptions = { webSearchEnabled: context.webSearchEnabled };

    const { character, plugins, modeResolution } = isDefaultCharacter
      ? await agentLoader.getDefaultCharacter(context.agentMode, loaderOptions)
      : await agentLoader.loadCharacter(
          context.characterId!,
          context.agentMode,
          loaderOptions,
        );

    if (modeResolution.upgradeReason !== "none") {
      elizaLogger.info(
        `[RuntimeFactory] Mode upgraded: ${context.agentMode} → ${modeResolution.mode} (reason: ${modeResolution.upgradeReason})`,
      );
    }

    const agentId = (
      character.id ? stringToUuid(character.id) : this.DEFAULT_AGENT_ID
    ) as UUID;

    const webSearchSuffix = context.webSearchEnabled ? ":ws" : "";
    const cacheKey = `${agentId}${webSearchSuffix}`;

    const cachedRuntime = await runtimeCache.getWithHealthCheck(
      cacheKey,
      dbAdapterPool,
    );
    if (cachedRuntime) {
      elizaLogger.info(
        `[RuntimeFactory] Cache HIT: ${character.name} (${Date.now() - startTime}ms)`,
      );
      this.applyUserContext(cachedRuntime, context);
      edgeRuntimeCache.incrementRequestCount(agentId as string).catch((e) => {
        elizaLogger.debug(`[RuntimeFactory] Edge cache increment failed: ${e}`);
      });

      return cachedRuntime;
    }

    elizaLogger.info(`[RuntimeFactory] Cache MISS: ${character.name}`);

    const embeddingModel =
      (character.settings?.OPENAI_EMBEDDING_MODEL as string) ||
      (character.settings?.ELIZAOS_CLOUD_EMBEDDING_MODEL as string);

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

    await this.initializeRuntime(runtime, character, agentId);
    await this.waitForMcpServiceIfNeeded(runtime, filteredPlugins);

    await runtimeCache.set(cacheKey, runtime, character.name, agentId);

    edgeRuntimeCache
      .markRuntimeWarm(agentId as string, {
        isWarm: true,
        embeddingDimension: getStaticEmbeddingDimension(embeddingModel),
        characterName: character.name,
      })
      .catch((e) => {
        elizaLogger.debug(`[RuntimeFactory] Edge cache warm failed: ${e}`);
      });

    elizaLogger.success(
      `[RuntimeFactory] Runtime ready: ${character.name} (${modeResolution.mode}, webSearch=${context.webSearchEnabled}) in ${Date.now() - startTime}ms`,
    );
    return runtime;
  }

  private applyUserContext(runtime: AgentRuntime, context: UserContext): void {
    const settings = (runtime.character.settings || {}) as RuntimeSettings;
    settings.ELIZAOS_CLOUD_API_KEY = context.apiKey;
    settings.USER_ID = context.userId;
    settings.ENTITY_ID = context.entityId;
    settings.ORGANIZATION_ID = context.organizationId;
    settings.IS_ANONYMOUS = context.isAnonymous;

    if (context.modelPreferences) {
      settings.ELIZAOS_CLOUD_SMALL_MODEL =
        context.modelPreferences.smallModel ||
        settings.ELIZAOS_CLOUD_SMALL_MODEL;
      settings.ELIZAOS_CLOUD_LARGE_MODEL =
        context.modelPreferences.largeModel ||
        settings.ELIZAOS_CLOUD_LARGE_MODEL;
    }

    if (context.imageModel) {
      settings.ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL = context.imageModel;
    }

    if (context.appPromptConfig) {
      settings.appPromptConfig = context.appPromptConfig;
    }
  }

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

  private buildSettings(
    character: Character,
    context: UserContext,
  ): NonNullable<Character["settings"]> {
    const charSettings = (character.settings || {}) as Record<string, unknown>;
    const getSetting = (key: string, fallback: string) =>
      (charSettings[key] as string) || process.env[key] || fallback;

    // Get embedding dimension from known model dimensions (skips 500ms API call)
    const embeddingModel =
      (charSettings.OPENAI_EMBEDDING_MODEL as string) ||
      (charSettings.ELIZAOS_CLOUD_EMBEDDING_MODEL as string);
    const embeddingDimension = getStaticEmbeddingDimension(embeddingModel);

    return {
      ...charSettings,
      POSTGRES_URL: process.env.DATABASE_URL!,
      DATABASE_URL: process.env.DATABASE_URL!,
      // Pass embedding dimension to runtime so it skips the embedding API call
      EMBEDDING_DIMENSION: String(embeddingDimension),
      ELIZAOS_CLOUD_API_KEY: context.apiKey,
      ELIZAOS_CLOUD_BASE_URL: getElizaCloudApiUrl(),
      ELIZAOS_CLOUD_SMALL_MODEL:
        context.modelPreferences?.smallModel ||
        getSetting("ELIZAOS_CLOUD_SMALL_MODEL", getDefaultModels().small),
      ELIZAOS_CLOUD_LARGE_MODEL:
        context.modelPreferences?.largeModel ||
        getSetting("ELIZAOS_CLOUD_LARGE_MODEL", getDefaultModels().large),
      ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL:
        context.imageModel ||
        getSetting(
          "ELIZAOS_CLOUD_IMAGE_GENERATION_MODEL",
          DEFAULT_IMAGE_MODEL.modelId,
        ),
      ...buildElevenLabsSettings(charSettings),
      ...(charSettings.mcp
        ? {
            mcp: this.transformMcpSettings(
              charSettings.mcp as Record<string, unknown>,
            ),
          }
        : {}),
      USER_ID: context.userId,
      ENTITY_ID: context.entityId,
      ORGANIZATION_ID: context.organizationId,
      IS_ANONYMOUS: context.isAnonymous,
      ...(context.appPromptConfig
        ? { appPromptConfig: context.appPromptConfig }
        : {}),
      ...(context.webSearchEnabled && process.env.TAVILY_API_KEY
        ? { TAVILY_API_KEY: process.env.TAVILY_API_KEY }
        : {}),
    } as unknown as NonNullable<Character["settings"]>;
  }

  private async initializeRuntime(
    runtime: AgentRuntime,
    character: Character,
    agentId: UUID,
  ): Promise<void> {
    const startTime = Date.now();

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
      elizaLogger.warn(
        `[RuntimeFactory] Init error: ${msg.substring(0, 50)}...`,
      );
      this.resolveInitPromise(runtime);
    }

    // Check if agent exists
    const agentExists = await runtime.getAgent(agentId);

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
      })(),
    );

    if (parallelOps.length > 0) {
      const parallelStart = Date.now();
      await Promise.all(parallelOps);
      elizaLogger.debug(
        `[RuntimeFactory] Parallel ops: ${Date.now() - parallelStart}ms`,
      );
    }

    if (initSucceeded) {
      this.resolveInitPromise(runtime);
    }

    elizaLogger.info(`[RuntimeFactory] Init: ${Date.now() - startTime}ms`);
  }

  private resolveInitPromise(runtime: AgentRuntime): void {
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
    const maxWaitMs = 1000; // Reduced from 2s to 1s
    const maxDelay = 200;
    let waitMs = 5; // Start lower at 5ms
    let mcpService: McpService | null = null;

    // Check immediately first
    mcpService = runtime.getService("mcp") as McpService | null;

    // Exponential backoff: 5, 10, 20, 40, 80, 160, 200, 200...
    while (!mcpService && Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, waitMs));
      mcpService = runtime.getService("mcp") as McpService | null;
      waitMs = Math.min(waitMs * 2, maxDelay);
    }

    const elapsed = Date.now() - startTime;
    if (!mcpService) {
      elizaLogger.warn(
        `[RuntimeFactory] MCP service not available after ${elapsed}ms`,
      );
      return;
    }

    elizaLogger.debug(`[RuntimeFactory] MCP service found in ${elapsed}ms`);

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

export function getRuntimeCacheStats(): {
  runtime: { size: number; maxSize: number };
} {
  return runtimeFactory.getCacheStats();
}

export const runtimeFactory = RuntimeFactory.getInstance();

export async function invalidateRuntime(agentId: string): Promise<boolean> {
  return runtimeFactory.invalidateRuntime(agentId);
}

export function isRuntimeCached(agentId: string): boolean {
  return runtimeFactory.isRuntimeCached(agentId);
}

export { getStaticEmbeddingDimension, KNOWN_EMBEDDING_DIMENSIONS };
