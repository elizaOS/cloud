/**
 * Edge-Compatible Runtime State Cache
 *
 * Provides a shared cache layer that works in both Edge and Node.js runtimes.
 * Uses Upstash Redis for edge compatibility.
 *
 * PERFORMANCE:
 * - Caches runtime initialization state (is warm, embedding dimension set, etc.)
 * - Caches character data for instant access on Edge
 * - Reduces cold start latency by signaling pre-warming
 */

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

// Initialize Redis client (works in both Edge and Node.js)
const getRedis = (): Redis | null => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
};

// Cache key prefixes - must match proxy.ts for pre-warm signals
const EDGE_CACHE_PREFIX = "edge:runtime:";
const PROXY_PREWARM_PREFIX = "proxy:prewarm:";

export interface RuntimeWarmState {
  /** Whether the runtime is initialized and warm */
  isWarm: boolean;
  /** When the runtime was last warmed */
  warmedAt: number;
  /** Embedding dimension that was set */
  embeddingDimension: number;
  /** Character name for this runtime */
  characterName?: string;
  /** Number of requests served since warm */
  requestCount: number;
}

export interface CachedCharacterData {
  id: string;
  name: string;
  embeddingModel?: string;
  plugins: string[];
  hasKnowledge: boolean;
  hasMcp: boolean;
  cachedAt: number;
}

/**
 * Edge-compatible runtime state cache
 */
export class EdgeRuntimeCache {
  private redis: Redis | null = null;

  // TTLs in seconds
  private readonly WARM_STATE_TTL = 300; // 5 minutes
  private readonly CHARACTER_DATA_TTL = 600; // 10 minutes
  private readonly PRE_WARM_SIGNAL_TTL = 30; // 30 seconds

  constructor() {
    this.redis = getRedis();
  }

  /**
   * Check if runtime is warm for a given agent
   */
  async isRuntimeWarm(agentId: string): Promise<boolean> {
    if (!this.redis) return false;

    try {
      const state = await this.redis.get<string>(
        `${EDGE_CACHE_PREFIX}warm:${agentId}`,
      );
      if (!state) return false;

      const parsed = JSON.parse(state) as RuntimeWarmState;
      return (
        parsed.isWarm &&
        Date.now() - parsed.warmedAt < this.WARM_STATE_TTL * 1000
      );
    } catch (error) {
      logger.debug(`[EdgeCache] isRuntimeWarm check failed: ${error}`);
      return false;
    }
  }

  /**
   * Mark runtime as warm after initialization
   */
  async markRuntimeWarm(
    agentId: string,
    state: Omit<RuntimeWarmState, "warmedAt" | "requestCount">,
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const fullState: RuntimeWarmState = {
        ...state,
        warmedAt: Date.now(),
        requestCount: 0,
      };

      await this.redis.setex(
        `${EDGE_CACHE_PREFIX}warm:${agentId}`,
        this.WARM_STATE_TTL,
        JSON.stringify(fullState),
      );

      logger.debug(`[EdgeCache] Marked runtime warm: ${agentId}`);
    } catch (error) {
      logger.warn(`[EdgeCache] Failed to mark runtime warm: ${error}`);
    }
  }

  /**
   * Increment request count for a warm runtime (for analytics)
   */
  async incrementRequestCount(agentId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const key = `${EDGE_CACHE_PREFIX}warm:${agentId}`;
      const state = await this.redis.get<string>(key);

      if (state) {
        const parsed = JSON.parse(state) as RuntimeWarmState;
        parsed.requestCount++;

        // Refresh TTL on activity
        await this.redis.setex(
          key,
          this.WARM_STATE_TTL,
          JSON.stringify(parsed),
        );
      }
    } catch (error) {
      // Non-critical, ignore
    }
  }

  /**
   * Get warm runtime state for monitoring
   */
  async getWarmState(agentId: string): Promise<RuntimeWarmState | null> {
    if (!this.redis) return null;

    try {
      const state = await this.redis.get<string>(
        `${EDGE_CACHE_PREFIX}warm:${agentId}`,
      );
      return state ? JSON.parse(state) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Signal that a runtime should be pre-warmed
   * Called from Edge middleware when it detects an incoming request for a cold runtime
   */
  async signalPreWarm(agentId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const key = `${EDGE_CACHE_PREFIX}prewarm:${agentId}`;

      // Only signal if not already signaled
      const existing = await this.redis.get(key);
      if (!existing) {
        await this.redis.setex(key, this.PRE_WARM_SIGNAL_TTL, "pending");
        logger.debug(`[EdgeCache] Signaled pre-warm for: ${agentId}`);
      }
    } catch (error) {
      logger.debug(`[EdgeCache] Pre-warm signal failed: ${error}`);
    }
  }

  /**
   * Check and consume pre-warm signal
   * Called from Node.js runtime to check if it should pre-warm
   * Checks both edge cache and proxy cache keys for compatibility
   */
  async consumePreWarmSignal(agentId: string): Promise<boolean> {
    if (!this.redis) return false;

    try {
      // Check both edge cache and proxy cache keys
      const edgeKey = `${EDGE_CACHE_PREFIX}prewarm:${agentId}`;
      const proxyKey = `${PROXY_PREWARM_PREFIX}${agentId}`;

      // Try to consume from either key
      const [edgeSignal, proxySignal] = await Promise.all([
        this.redis.getdel(edgeKey),
        this.redis.getdel(proxyKey),
      ]);

      return edgeSignal === "pending" || proxySignal === "pending";
    } catch (error) {
      return false;
    }
  }

  /**
   * Cache character data for fast edge access
   */
  async cacheCharacterData(data: CachedCharacterData): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setex(
        `${EDGE_CACHE_PREFIX}char:${data.id}`,
        this.CHARACTER_DATA_TTL,
        JSON.stringify({ ...data, cachedAt: Date.now() }),
      );

      logger.debug(`[EdgeCache] Cached character data: ${data.name}`);
    } catch (error) {
      logger.warn(`[EdgeCache] Failed to cache character: ${error}`);
    }
  }

  /**
   * Get cached character data
   */
  async getCharacterData(
    characterId: string,
  ): Promise<CachedCharacterData | null> {
    if (!this.redis) return null;

    try {
      const data = await this.redis.get<string>(
        `${EDGE_CACHE_PREFIX}char:${characterId}`,
      );
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Invalidate character data (call when character is updated)
   */
  async invalidateCharacter(characterId: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(`${EDGE_CACHE_PREFIX}char:${characterId}`);
      logger.debug(`[EdgeCache] Invalidated character: ${characterId}`);
    } catch (error) {
      logger.warn(`[EdgeCache] Failed to invalidate character: ${error}`);
    }
  }

  /**
   * Get all warm runtimes (for monitoring)
   */
  async getAllWarmRuntimes(): Promise<RuntimeWarmState[]> {
    if (!this.redis) return [];

    try {
      // Use SCAN to find all warm runtime keys
      const pattern = `${EDGE_CACHE_PREFIX}warm:*`;
      let cursor = 0;
      const warmStates: RuntimeWarmState[] = [];

      do {
        const result: [string | number, string[]] = await this.redis.scan(
          cursor,
          {
            match: pattern,
            count: 100,
          },
        );

        cursor =
          typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];
        const keys = result[1];

        if (keys.length > 0) {
          const values = await this.redis.mget<string[]>(...keys);
          for (const value of values) {
            if (value) {
              warmStates.push(JSON.parse(value));
            }
          }
        }
      } while (cursor !== 0);

      return warmStates;
    } catch (error) {
      logger.warn(`[EdgeCache] Failed to get warm runtimes: ${error}`);
      return [];
    }
  }
}

// Export singleton instance
export const edgeRuntimeCache = new EdgeRuntimeCache();

/**
 * Export the static embedding dimension lookup for use in Edge
 * This allows Edge middleware to know the dimension without calling Node.js
 */
export const KNOWN_EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "embed-english-v3.0": 1024,
  "embed-multilingual-v3.0": 1024,
  "voyage-large-2": 1536,
  "voyage-code-2": 1536,
  default: 1536,
};

export function getStaticEmbeddingDimension(model?: string): number {
  if (!model) return KNOWN_EMBEDDING_DIMENSIONS["default"];

  if (KNOWN_EMBEDDING_DIMENSIONS[model]) {
    return KNOWN_EMBEDDING_DIMENSIONS[model];
  }

  for (const [key, dim] of Object.entries(KNOWN_EMBEDDING_DIMENSIONS)) {
    if (model.includes(key)) {
      return dim;
    }
  }

  return KNOWN_EMBEDDING_DIMENSIONS["default"];
}
