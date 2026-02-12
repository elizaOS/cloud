/**
 * Entity Settings Cache Layer
 *
 * Provides two-tier caching (in-memory + Redis) with proper invalidation for entity settings.
 * Settings are cached per-user and optionally per-agent for fast prefetch operations.
 *
 * PERF: In-memory cache eliminates Redis round-trip (~5-30ms) for repeated requests
 * from the same user within the same serverless function instance.
 * This is the same pattern used by Privy and Character caches.
 */
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import type { EntitySettingValue, EntitySettingSource } from "./types";

/**
 * Cache key prefix for entity settings
 */
const CACHE_PREFIX = "entity_settings";

/**
 * Default TTL for cached settings (5 minutes)
 * Longer TTL reduces DB load since:
 * - Cache is explicitly invalidated on OAuth connect/disconnect
 * - Entity settings rarely change during normal operation
 * - Changes are immediately visible after explicit cache invalidation
 */
const DEFAULT_TTL_SECONDS = 300;

/**
 * Cached entity settings structure
 */
interface CachedSettings {
  /** Map of setting key to value, serialized as object */
  settings: Record<string, EntitySettingValue>;
  /** Timestamp when this was cached */
  cachedAt: number;
  /** Source tracking for debugging */
  sources: Record<string, EntitySettingSource>;
}

// ---------------------------------------------------------------------------
// PERF: In-memory cache for entity settings (60s TTL).
// Entity settings rarely change during active sessions. This eliminates the
// Redis round-trip (~5-30ms) for repeated lookups within the same process.
// On a warm path this turns a 665ms phase into ~0ms.
// ---------------------------------------------------------------------------
interface InMemorySettingsEntry {
  settings: Map<string, EntitySettingValue>;
  sources: Record<string, EntitySettingSource>;
  expiresAt: number;
}

const IN_MEMORY_SETTINGS_CACHE = new Map<string, InMemorySettingsEntry>();
const IN_MEMORY_SETTINGS_TTL_MS = 60_000; // 60 seconds
const IN_MEMORY_SETTINGS_MAX_SIZE = 200;

function getFromInMemorySettingsCache(
  cacheKey: string,
): { settings: Map<string, EntitySettingValue>; sources: Record<string, EntitySettingSource> } | null {
  const entry = IN_MEMORY_SETTINGS_CACHE.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    IN_MEMORY_SETTINGS_CACHE.delete(cacheKey);
    return null;
  }
  return { settings: entry.settings, sources: entry.sources };
}

function setInMemorySettingsCache(
  cacheKey: string,
  settings: Map<string, EntitySettingValue>,
  sources: Record<string, EntitySettingSource>,
): void {
  if (IN_MEMORY_SETTINGS_CACHE.size >= IN_MEMORY_SETTINGS_MAX_SIZE) {
    // First pass: evict expired entries
    const now = Date.now();
    for (const [key, value] of IN_MEMORY_SETTINGS_CACHE) {
      if (now > value.expiresAt) {
        IN_MEMORY_SETTINGS_CACHE.delete(key);
      }
    }
    // Second pass: if still over capacity, evict oldest entries (by insertion order)
    if (IN_MEMORY_SETTINGS_CACHE.size >= IN_MEMORY_SETTINGS_MAX_SIZE) {
      const keys = Array.from(IN_MEMORY_SETTINGS_CACHE.keys());
      const toRemove = keys.length - Math.floor(IN_MEMORY_SETTINGS_MAX_SIZE * 0.75);
      for (let i = 0; i < toRemove; i++) {
        IN_MEMORY_SETTINGS_CACHE.delete(keys[i]);
      }
    }
  }
  IN_MEMORY_SETTINGS_CACHE.set(cacheKey, {
    settings,
    sources,
    expiresAt: Date.now() + IN_MEMORY_SETTINGS_TTL_MS,
  });
}

function invalidateInMemorySettingsCache(cacheKey: string): void {
  IN_MEMORY_SETTINGS_CACHE.delete(cacheKey);
}

function invalidateInMemorySettingsCacheForUser(userId: string): void {
  const prefix = `${CACHE_PREFIX}:${userId}:`;
  for (const key of IN_MEMORY_SETTINGS_CACHE.keys()) {
    if (key.startsWith(prefix)) {
      IN_MEMORY_SETTINGS_CACHE.delete(key);
    }
  }
}

/**
 * Build cache key for entity settings
 *
 * @param userId - User ID
 * @param agentId - Optional agent ID (null for global user settings)
 */
function buildCacheKey(userId: string, agentId: string | null): string {
  const agentPart = agentId || "global";
  return `${CACHE_PREFIX}:${userId}:${agentPart}`;
}

/**
 * Build cache key pattern for all of a user's settings
 *
 * @param userId - User ID
 */
function buildUserPattern(userId: string): string {
  return `${CACHE_PREFIX}:${userId}:*`;
}

/**
 * Entity Settings Cache
 *
 * Two-tier cache: in-memory (60s TTL) → Redis (5min TTL) → DB.
 * Supports targeted invalidation on settings changes.
 */
export class EntitySettingsCache {
  private readonly ttlSeconds: number;

  constructor(ttlSeconds = DEFAULT_TTL_SECONDS) {
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get cached settings with source tracking
   *
   * Resolution order: in-memory → Redis → null (caller fetches from DB)
   *
   * @param userId - User ID
   * @param agentId - Agent ID (null for global settings)
   * @returns Cached settings with sources or null if not cached
   */
  async get(
    userId: string,
    agentId: string | null
  ): Promise<{
    settings: Map<string, EntitySettingValue>;
    sources: Record<string, EntitySettingSource>;
  } | null> {
    const key = buildCacheKey(userId, agentId);

    // PERF: Check in-memory cache first (eliminates Redis round-trip)
    const inMemory = getFromInMemorySettingsCache(key);
    if (inMemory) {
      logger.debug(`[EntitySettingsCache] In-memory cache HIT: ${key}`);
      return inMemory;
    }

    // Fall back to Redis
    const cached = await cache.get<CachedSettings>(key);
    if (!cached) {
      return null;
    }

    logger.debug(`[EntitySettingsCache] Redis cache HIT: ${key}`);

    const result = {
      settings: new Map(Object.entries(cached.settings)),
      sources: cached.sources,
    };

    // Populate in-memory cache from Redis hit
    setInMemorySettingsCache(key, result.settings, result.sources);

    return result;
  }

  /**
   * Cache settings for a user+agent combination
   *
   * Writes to both in-memory and Redis caches.
   *
   * @param userId - User ID
   * @param agentId - Agent ID (null for global settings)
   * @param settings - Settings map to cache
   * @param sources - Source tracking for each setting
   */
  async set(
    userId: string,
    agentId: string | null,
    settings: Map<string, EntitySettingValue>,
    sources: Record<string, EntitySettingSource>
  ): Promise<void> {
    const key = buildCacheKey(userId, agentId);

    // PERF: Populate in-memory cache immediately
    setInMemorySettingsCache(key, settings, sources);

    const cached: CachedSettings = {
      settings: Object.fromEntries(settings),
      cachedAt: Date.now(),
      sources,
    };

    await cache.set(key, cached, this.ttlSeconds);

    logger.debug(
      `[EntitySettingsCache] Cached ${settings.size} settings for ${key}`
    );
  }

  /**
   * Invalidate cached settings for a specific user+agent combination
   *
   * Clears both in-memory and Redis caches.
   *
   * @param userId - User ID
   * @param agentId - Agent ID (null to invalidate global settings only)
   */
  async invalidate(userId: string, agentId: string | null): Promise<void> {
    const key = buildCacheKey(userId, agentId);

    // PERF: Clear in-memory cache first
    invalidateInMemorySettingsCache(key);

    await cache.del(key);

    logger.info(`[EntitySettingsCache] Invalidated cache for ${key}`);
  }

  /**
   * Invalidate all cached settings for a user (both global and agent-specific)
   *
   * Use this when a user's global settings change, as it affects all agent interactions.
   * Clears both in-memory and Redis caches.
   *
   * @param userId - User ID
   */
  async invalidateUser(userId: string): Promise<void> {
    // PERF: Clear in-memory cache first
    invalidateInMemorySettingsCacheForUser(userId);

    const pattern = buildUserPattern(userId);
    await cache.delPattern(pattern);

    logger.info(
      `[EntitySettingsCache] Invalidated all settings for user ${userId}`
    );
  }

}

/**
 * Singleton instance of the entity settings cache
 */
export const entitySettingsCache = new EntitySettingsCache();
