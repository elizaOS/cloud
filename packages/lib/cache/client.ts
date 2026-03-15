/**
 * Redis-based cache client with stale-while-revalidate support and circuit breaker.
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";
import { logger } from "@/lib/utils/logger";

/**
 * Cached value wrapper with metadata for stale-while-revalidate.
 */
interface CachedValue<T> {
  /** The cached data. */
  data: T;
  /** Timestamp when the value was cached. */
  cachedAt: number;
  /** Timestamp when the value becomes stale. */
  staleAt: number;
}

interface CacheRedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
  scan(
    cursor: string | number,
    options: { match: string; count: number },
  ): Promise<[string | number, string[]]>;
  mget(...keys: string[]): Promise<Array<string | null>>;
}

type NativeRedisClient = ReturnType<typeof createClient>;

class UpstashRedisAdapter implements CacheRedisClient {
  constructor(private readonly client: UpstashRedis) {}

  get(key: string): Promise<string | null> {
    return this.client.get<string>(key);
  }

  setex(key: string, ttlSeconds: number, value: string): Promise<unknown> {
    return this.client.setex(key, ttlSeconds, value);
  }

  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<string | null> {
    return this.client.set(key, value, options as never) as Promise<string | null>;
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  expire(key: string, ttlSeconds: number): Promise<unknown> {
    return this.client.expire(key, ttlSeconds);
  }

  getdel(key: string): Promise<string | null> {
    return this.client.getdel<string>(key);
  }

  del(...keys: string[]): Promise<unknown> {
    return this.client.del(...keys);
  }

  scan(
    cursor: string | number,
    options: { match: string; count: number },
  ): Promise<[string | number, string[]]> {
    return this.client.scan(cursor, options);
  }

  mget(...keys: string[]): Promise<Array<string | null>> {
    return this.client.mget<string[]>(...keys) as Promise<Array<string | null>>;
  }
}

class NodeRedisAdapter implements CacheRedisClient {
  constructor(private readonly client: NativeRedisClient) {}

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  setex(key: string, ttlSeconds: number, value: string): Promise<unknown> {
    return this.client.setEx(key, ttlSeconds, value);
  }

  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<string | null> {
    if (options?.nx || options?.px) {
      return this.client.set(key, value, {
        ...(options.nx ? { NX: true } : {}),
        ...(options.px ? { PX: options.px } : {}),
      });
    }

    return this.client.set(key, value);
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  expire(key: string, ttlSeconds: number): Promise<unknown> {
    return this.client.expire(key, ttlSeconds);
  }

  getdel(key: string): Promise<string | null> {
    return this.client.getDel(key);
  }

  del(...keys: string[]): Promise<unknown> {
    if (keys.length === 1) {
      return this.client.del(keys[0]);
    }

    return this.client.del(keys);
  }

  async scan(
    cursor: string | number,
    options: { match: string; count: number },
  ): Promise<[string | number, string[]]> {
    const result = await this.client.scan(Number(cursor), {
      MATCH: options.match,
      COUNT: options.count,
    });

    return [result.cursor, result.keys];
  }

  mget(...keys: string[]): Promise<Array<string | null>> {
    return this.client.mGet(keys);
  }
}

/**
 * Redis cache client with circuit breaker, stale-while-revalidate, and error handling.
 */
export class CacheClient {
  private redis: CacheRedisClient | null = null;
  private enabled: boolean | null = null;
  private initialized = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000;
  private revalidationQueue = new Map<string, Promise<void>>();
  // MEMORY LEAK FIX: Add limits and timeouts to revalidation queue
  private readonly MAX_REVALIDATION_QUEUE_SIZE = 100;
  private readonly REVALIDATION_TIMEOUT_MS = 30000; // 30 seconds
  private nativeRedisConnectPromise: Promise<void> | null = null;
  private nativeRedisReady = false;

  private isPlaceholderCredential(value: string | undefined): boolean {
    if (!value) return false;

    return (
      value.includes("your-redis.upstash.io") ||
      value.includes("default:token@your-redis.upstash.io") ||
      value === "token" ||
      value === "unset"
    );
  }

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.enabled = process.env.CACHE_ENABLED !== "false";

    if (!this.enabled) {
      if (process.env.NODE_ENV === "production") {
        logger.error(
          "🚨 [Cache] CRITICAL: Caching disabled in production! " +
            "This will cause severe performance degradation. " +
            "Set CACHE_ENABLED=true and configure Redis credentials.",
        );
      } else {
        logger.warn("[Cache] Caching is disabled via CACHE_ENABLED flag");
      }
      return;
    }

    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    const restUrl = process.env.KV_REST_API_URL;
    const restToken = process.env.KV_REST_API_TOKEN;

    const hasNativeRedisConfig = Boolean(redisUrl);
    const hasRestRedisConfig = Boolean(restUrl || restToken);
    const nativeRedisConfigured = Boolean(redisUrl) && !this.isPlaceholderCredential(redisUrl);
    const restRedisConfigured =
      Boolean(restUrl && restToken) &&
      !this.isPlaceholderCredential(restUrl) &&
      !this.isPlaceholderCredential(restToken);

    if (nativeRedisConfigured && redisUrl) {
      const client = createClient({ url: redisUrl });

      client.on("error", (error) => {
        logger.warn("[Cache] Native Redis client error", {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      this.nativeRedisReady = false;
      this.nativeRedisConnectPromise = client
        .connect()
        .then(() => {
          this.nativeRedisReady = true;
          logger.info("[Cache] ✓ Cache client initialized with native Redis protocol");
        })
        .catch((error) => {
          this.recordFailure();
          this.enabled = false;
          this.redis = null;
          logger.warn("[Cache] Failed to connect to native Redis", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      this.redis = new NodeRedisAdapter(client);
      return;
    }

    if (hasNativeRedisConfig) {
      logger.warn("[Cache] Ignoring placeholder or invalid native Redis credentials.");
    }

    if (restRedisConfigured && restUrl && restToken) {
      this.nativeRedisConnectPromise = null;
      this.nativeRedisReady = true;
      this.redis = new UpstashRedisAdapter(
        new UpstashRedis({
          url: restUrl,
          token: restToken,
        }),
      );
      logger.info(
        "[Cache] ✓ Cache client initialized with REST API (consider using native protocol)",
      );
      return;
    }

    if (hasRestRedisConfig) {
      logger.warn("[Cache] Ignoring placeholder or incomplete Redis REST credentials.");
    }

    if (process.env.NODE_ENV === "production") {
      logger.error(
        "🚨 [Cache] CRITICAL: Missing Redis credentials in production! " +
          "Caching disabled - this will cause severe performance issues. " +
          "Set REDIS_URL or KV_URL for native protocol, or KV_REST_API_URL + KV_REST_API_TOKEN.",
      );
    } else {
      logger.warn("[Cache] Missing Redis credentials, caching disabled.");
    }
    this.enabled = false;
  }

  private async getRedisClient(): Promise<CacheRedisClient | null> {
    this.initialize();
    if (!this.enabled || !this.redis || this.isCircuitOpen()) {
      return null;
    }

    if (this.nativeRedisConnectPromise) {
      await this.nativeRedisConnectPromise;
      if (!this.enabled || !this.redis || this.isCircuitOpen()) {
        return null;
      }
    }

    return this.redis;
  }

  /**
   * Whether the cache backend (Redis) is connected and the circuit breaker is closed.
   */
  isAvailable(): boolean {
    this.initialize();
    return !!(this.enabled && this.redis && !this.isCircuitOpen());
  }

  /**
   * Gets a value from cache.
   *
   * @param key - Cache key.
   * @returns Cached value or null if not found or invalid.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = await this.getRedisClient();
    if (!redis) return null;

    try {
      const start = Date.now();
      const value = await redis.get(key);
      const duration = Date.now() - start;

      if (value === null || value === undefined) {
        this.logMetric(key, "miss", duration);
        return null;
      }

      // Check for corrupted cache values
      if (typeof value === "string" && value === "[object Object]") {
        logger.warn(`[Cache] Corrupted cache value detected for key ${key}, deleting`);
        await this.del(key);
        return null;
      }

      // Parse JSON string back to object
      const parsed: T = typeof value === "string" ? JSON.parse(value) : value;

      if (!this.isValidCacheValue(parsed)) {
        logger.warn(`[Cache] Invalid cached value for key ${key}, deleting`);
        await this.del(key);
        return null;
      }

      this.resetFailures();
      this.logMetric(key, "hit", duration);
      return parsed;
    } catch (error) {
      this.recordFailure();
      logger.warn("[Cache] GET failed, treating as cache miss", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Gets a value from cache with stale-while-revalidate support.
   *
   * Returns stale data immediately if available, then revalidates in the background.
   *
   * @param key - Cache key.
   * @param staleTTL - Time in seconds before data is considered stale.
   * @param revalidate - Function to fetch fresh data.
   * @param ttl - Optional total time to live in seconds. Defaults to staleTTL * 2.
   * @returns Cached value (stale or fresh) or null.
   */
  async getWithSWR<T>(
    key: string,
    staleTTL: number,
    revalidate: () => Promise<T>,
    ttl?: number,
  ): Promise<T | null> {
    const effectiveTTL = ttl ?? staleTTL * 2;
    const redis = await this.getRedisClient();
    if (!redis) {
      return await revalidate();
    }

    try {
      const start = Date.now();
      const value = await redis.get(key);
      const duration = Date.now() - start;

      if (value === null || value === undefined) {
        this.logMetric(key, "miss", duration);
        const fresh = await revalidate();
        if (fresh !== null) {
          await this.set(
            key,
            {
              data: fresh,
              cachedAt: Date.now(),
              staleAt: Date.now() + staleTTL * 1000,
            } as CachedValue<T>,
            effectiveTTL,
          );
        }
        return fresh;
      }

      const raw = typeof value === "string" ? JSON.parse(value) : value;
      const parsed = raw as CachedValue<T>;

      const now = Date.now();
      const isStale = now > parsed.staleAt;

      if (isStale) {
        this.logMetric(key, "stale", duration);

        // Return stale data immediately
        const staleData = parsed.data;

        // MEMORY LEAK FIX: Implement queue size limit and timeout
        // Check queue size before adding new revalidation
        if (this.revalidationQueue.size >= this.MAX_REVALIDATION_QUEUE_SIZE) {
          logger.warn(
            `[Cache] Revalidation queue full (${this.revalidationQueue.size}/${this.MAX_REVALIDATION_QUEUE_SIZE}). ` +
              `Skipping background revalidation for key: ${key}`,
          );
          return staleData;
        }

        // Revalidate in background (deduplicated)
        if (!this.revalidationQueue.has(key)) {
          // Create timeout promise
          const timeoutPromise = new Promise<T | null>((_, reject) => {
            setTimeout(
              () => reject(new Error("Revalidation timeout")),
              this.REVALIDATION_TIMEOUT_MS,
            );
          });

          // Race revalidation against timeout
          const revalidationPromise = Promise.race([revalidate(), timeoutPromise])
            .then((fresh) => {
              if (fresh !== null) {
                return this.set(
                  key,
                  {
                    data: fresh,
                    cachedAt: Date.now(),
                    staleAt: Date.now() + staleTTL * 1000,
                  } as CachedValue<T>,
                  effectiveTTL,
                );
              }
            })
            .finally(() => {
              this.revalidationQueue.delete(key);
            });

          this.revalidationQueue.set(key, revalidationPromise);
        }

        return staleData;
      }

      this.logMetric(key, "hit", duration);
      this.resetFailures();
      return parsed.data;
    } catch (error) {
      this.recordFailure();
      logger.warn("[Cache] GET-with-SWR failed, falling back to revalidate", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return await revalidate();
    }
  }

  /**
   * Sets a value in cache with TTL.
   *
   * @param key - Cache key.
   * @param value - Value to cache (must be JSON-serializable).
   * @param ttlSeconds - Time to live in seconds.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const redis = await this.getRedisClient();
    if (!redis) return;

    if (!this.isValidCacheValue(value)) {
      logger.error(`[Cache] Attempted to cache invalid value for key ${key}`);
      return;
    }

    // Always serialize to JSON string before storing
    const serialized = typeof value === "string" ? value : JSON.stringify(value);

    try {
      const start = Date.now();
      await redis.setex(key, ttlSeconds, serialized);

      this.resetFailures();
      this.logMetric(key, "set", Date.now() - start);
    } catch (error) {
      this.recordFailure();
      logger.warn("[Cache] SET failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Atomically set key to value with TTL only if key does not exist (SET NX PX).
   * Used for single-use nonces to prevent TOCTOU races between getAndDelete and set.
   *
   * @param key - Cache key.
   * @param value - Value to set (string or serializable).
   * @param ttlMs - Time to live in milliseconds.
   * @returns true if key was set, false if key already existed.
   */
  async setIfNotExists<T>(key: string, value: T, ttlMs: number): Promise<boolean> {
    const redis = await this.getRedisClient();
    if (!redis) {
      throw new Error("Cache unavailable for atomic set-if-not-exists");
    }

    if (!this.isValidCacheValue(value)) {
      throw new Error(`Invalid cache value for key ${key}`);
    }

    const serialized = typeof value === "string" ? value : JSON.stringify(value);

    const start = Date.now();
    const result = await redis.set(key, serialized, { nx: true, px: ttlMs });
    this.resetFailures();
    this.logMetric(key, "setIfNotExists", Date.now() - start);
    return result === "OK";
  }

  /**
   * Atomically increments a numeric value in cache.
   * If the key does not exist, it is set to 0 before incrementing.
   *
   * @param key - Cache key to increment.
   * @returns The new value after incrementing.
   */
  async incr(key: string): Promise<number> {
    const redis = await this.getRedisClient();
    if (!redis) return 1;

    try {
      const result = await redis.incr(key);
      this.resetFailures();
      return result;
    } catch (error) {
      this.recordFailure();
      logger.error("[Cache] INCR failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return 1;
    }
  }

  /**
   * Sets a TTL (time to live) on an existing key.
   *
   * @param key - Cache key.
   * @param ttlSeconds - Time to live in seconds.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const redis = await this.getRedisClient();
    if (!redis) return;

    try {
      await redis.expire(key, ttlSeconds);
      this.resetFailures();
    } catch (error) {
      this.recordFailure();
      logger.error("[Cache] EXPIRE failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Atomically gets a value and deletes the key using GETDEL (Redis ≥6.2).
   * Used for single-use values (e.g. SIWE nonce) to prevent replay attacks.
   *
   * @param key - Cache key.
   * @returns The value if present, or null.
   */
  async getAndDelete<T>(key: string): Promise<T | null> {
    const redis = await this.getRedisClient();
    if (!redis) return null;

    try {
      // Use GETDEL for atomic get-and-delete (Redis ≥6.2)
      const value = await redis.getdel(key);
      if (value === null || value === undefined) return null;

      // Check for corrupted cache values
      if (typeof value === "string" && value === "[object Object]") {
        logger.warn(`[Cache] Corrupted cache value detected in getAndDelete for key ${key}`);
        return null;
      }

      // Plain strings (e.g. SIWE nonce, "used") are stored verbatim; only object payloads are JSON-serialized
      let parsed: T;
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value) as T;
        } catch {
          parsed = value as T;
        }
      } else {
        parsed = value as T;
      }
      this.resetFailures();
      return parsed;
    } catch (error) {
      this.recordFailure();
      logger.error("[Cache] GETDEL failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-throw Redis failures to prevent proceeding with a failed GETDEL
      throw new Error("Cache operation failed during getAndDelete", { cause: error });
    }
  }

  /**
   * Deletes a key from cache.
   *
   * @param key - Cache key to delete.
   */
  async del(key: string): Promise<void> {
    const redis = await this.getRedisClient();
    if (!redis) return;

    try {
      const start = Date.now();
      await redis.del(key);

      logger.debug(`[Cache] DEL: ${key}`);
      this.resetFailures();
      this.logMetric(key, "del", Date.now() - start);
    } catch (error) {
      this.recordFailure();
      logger.warn("[Cache] DEL failed", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN (non-blocking)
   *
   * Uses SCAN instead of KEYS to avoid blocking Redis on large keysets
   * See ANALYTICS_PR_REVIEW_ANALYSIS.md - Issue #7 (Fixed)
   *
   * SECURITY FIX: Added max iterations limit to prevent infinite loops
   *
   * @param pattern - Pattern to match (e.g., "org:*:cache")
   * @param batchSize - Number of keys to scan per iteration (default: 100)
   * @param maxIterations - Maximum iterations to prevent runaway scans (default: 1000)
   */
  async delPattern(pattern: string, batchSize = 100, maxIterations = 1000): Promise<void> {
    const redis = await this.getRedisClient();
    if (!redis) return;

    const start = Date.now();
    let cursor: string | number = 0;
    let totalDeleted = 0;
    let iterations = 0;

    do {
      // PERFORMANCE FIX: Limit iterations to prevent unbounded scans
      if (iterations >= maxIterations) {
        logger.warn(
          `[Cache] DEL_PATTERN reached max iterations (${maxIterations}) for pattern ${pattern}. ` +
            `Deleted ${totalDeleted} keys so far. Pattern may match too many keys. Consider narrowing the pattern.`,
        );
        break;
      }

      // Use SCAN instead of KEYS to avoid blocking Redis
      const result: [string | number, string[]] = await redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      });

      // result is [nextCursor, keys]
      // Upstash Redis returns cursor as string or number
      cursor = typeof result[0] === "string" ? Number.parseInt(result[0], 10) : result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
        logger.debug(
          `[Cache] DEL_PATTERN iteration ${++iterations}: deleted ${keys.length} keys (total: ${totalDeleted})`,
        );
      }

      // Small delay to avoid overwhelming Redis
      if (cursor !== 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } while (cursor !== 0 && iterations < maxIterations);

    const duration = Date.now() - start;

    if (totalDeleted === 0) {
      logger.debug(`[Cache] DEL_PATTERN: ${pattern} (no keys found)`);
    } else {
      logger.info(
        `[Cache] DEL_PATTERN: ${pattern} (deleted ${totalDeleted} keys in ${duration}ms, ${iterations} iterations)`,
      );
    }

    this.logMetric(pattern, "del_pattern", duration);
  }

  /**
   * Gets multiple values from cache in a single operation.
   *
   * @param keys - Array of cache keys.
   * @returns Array of cached values (null for misses).
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    const redis = await this.getRedisClient();
    if (!redis) {
      return keys.map(() => null);
    }

    try {
      const start = Date.now();
      const values = await redis.mget(...keys);

      // Parse each JSON string value
      const parsed = await Promise.all(
        values.map(async (value, index) => {
          if (value === null || value === undefined) return null;

          // Check for corrupted values
          if (typeof value === "string" && value === "[object Object]") {
            logger.warn(`[Cache] Corrupted cache value in mget for key ${keys[index]}, skipping`);
            await this.del(keys[index]);
            return null;
          }

          return typeof value === "string" ? JSON.parse(value) : value;
        }),
      );

      const hitCount = parsed.filter((v) => v !== null).length;
      logger.debug(`[Cache] MGET: ${keys.length} keys (${hitCount} hits)`);
      this.resetFailures();
      this.logMetric("mget", "hit", Date.now() - start, {
        keys: keys.length,
        hits: hitCount,
      });

      return parsed;
    } catch (error) {
      this.recordFailure();
      logger.warn("[Cache] MGET failed", {
        keys: keys.length,
        error: error instanceof Error ? error.message : String(error),
      });
      return keys.map(() => null);
    }
  }

  private isCircuitOpen(): boolean {
    if (this.failureCount < this.MAX_FAILURES) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    if (timeSinceLastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
      logger.info("[Cache] Circuit breaker timeout expired, attempting to reconnect");
      this.failureCount = 0;
      return false;
    }

    logger.warn(
      `[Cache] Circuit breaker OPEN (${this.failureCount} failures, retry in ${Math.ceil((this.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s)`,
    );
    return true;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount === this.MAX_FAILURES) {
      logger.error(`[Cache] Circuit breaker OPENED after ${this.MAX_FAILURES} failures`);
    }
  }

  private resetFailures(): void {
    if (this.failureCount > 0) {
      logger.info("[Cache] Circuit breaker CLOSED - cache operational");
      this.failureCount = 0;
    }
  }

  private isValidCacheValue<T>(value: T): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string" && value === "[object Object]") {
      return false;
    }

    if (typeof value === "object") {
      try {
        JSON.stringify(value);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  }

  private logMetric(
    _key: string,
    _operation: "hit" | "miss" | "set" | "setIfNotExists" | "del" | "del_pattern" | "stale",
    _durationMs: number,
    _metadata?: Record<string, unknown>,
  ): void {
    // Metrics logging disabled to reduce console noise
  }
}

export const cache = new CacheClient();
