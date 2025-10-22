import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

interface CachedValue<T> {
  data: T;
  cachedAt: number;
  staleAt: number;
}

export class CacheClient {
  private redis: Redis | null = null;
  private enabled: boolean | null = null;
  private initialized: boolean = false;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000;
  private revalidationQueue: Map<string, Promise<unknown>> = new Map();

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

    if (redisUrl) {
      this.redis = Redis.fromEnv();
      logger.info("[Cache] ✓ Cache client initialized with native Redis protocol");
    } else if (restUrl && restToken) {
      this.redis = new Redis({
        url: restUrl,
        token: restToken,
      });
      logger.info("[Cache] ✓ Cache client initialized with REST API (consider using native protocol)");
    } else {
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
      return;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    this.initialize();
    if (!this.enabled || !this.redis || this.isCircuitOpen()) return null;

    try {
      const start = Date.now();
      const value = await this.redis.get<string>(key);
      const duration = Date.now() - start;

      if (value === null || value === undefined) {
        this.logMetric(key, "miss", duration);
        return null;
      }

      // Check for corrupted cache values
      if (typeof value === "string" && value === "[object Object]") {
        logger.warn(`[Cache] Corrupted cache value detected for key ${key}, deleting`);
        this.del(key).catch(() => {}); // Fire-and-forget
        return null;
      }

      // Parse JSON string back to object
      let parsed: T;
      try {
        parsed = typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        logger.warn(`[Cache] Failed to parse cached value for key ${key}, deleting`);
        this.del(key).catch(() => {}); // Fire-and-forget
        return null;
      }

      if (!this.isValidCacheValue(parsed)) {
        logger.warn(`[Cache] Invalid cached value for key ${key}, deleting`);
        this.del(key).catch(() => {}); // Fire-and-forget
        return null;
      }

      this.resetFailures();
      this.logMetric(key, "hit", duration);
      return parsed;
    } catch (error) {
      this.recordFailure();
      logger.error(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  async getWithSWR<T>(
    key: string,
    staleTTL: number,
    revalidate: () => Promise<T>,
  ): Promise<T | null> {
    this.initialize();
    if (!this.enabled || !this.redis || this.isCircuitOpen()) {
      return await revalidate();
    }

    try {
      const start = Date.now();
      const value = await this.redis.get<string>(key);
      const duration = Date.now() - start;

      if (value === null || value === undefined) {
        this.logMetric(key, "miss", duration);
        const fresh = await revalidate();
        if (fresh !== null) {
          this.set(key, { data: fresh, cachedAt: Date.now(), staleAt: Date.now() + staleTTL * 1000 } as CachedValue<T>, staleTTL * 2).catch(() => {});
        }
        return fresh;
      }

      let parsed: CachedValue<T>;
      try {
        const raw = typeof value === "string" ? JSON.parse(value) : value;
        parsed = raw as CachedValue<T>;
      } catch {
        const fresh = await revalidate();
        if (fresh !== null) {
          this.set(key, { data: fresh, cachedAt: Date.now(), staleAt: Date.now() + staleTTL * 1000 } as CachedValue<T>, staleTTL * 2).catch(() => {});
        }
        return fresh;
      }

      const now = Date.now();
      const isStale = now > parsed.staleAt;

      if (isStale) {
        this.logMetric(key, "stale", duration);

        // Return stale data immediately
        const staleData = parsed.data;

        // Revalidate in background (deduplicated)
        if (!this.revalidationQueue.has(key)) {
          const revalidationPromise = revalidate().then((fresh) => {
            if (fresh !== null) {
              return this.set(key, { data: fresh, cachedAt: Date.now(), staleAt: Date.now() + staleTTL * 1000 } as CachedValue<T>, staleTTL * 2);
            }
          }).finally(() => {
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
      logger.error(`[Cache] Error in getWithSWR for key ${key}:`, error);
      return await revalidate();
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.initialize();
    if (!this.enabled || !this.redis || this.isCircuitOpen()) return;

    try {
      if (!this.isValidCacheValue(value)) {
        logger.error(`[Cache] Attempted to cache invalid value for key ${key}`);
        return;
      }

      // Always serialize to JSON string before storing
      const serialized = typeof value === "string" ? value : JSON.stringify(value);

      const start = Date.now();
      await this.redis.setex(key, ttlSeconds, serialized);

      this.resetFailures();
      logger.debug(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
      this.logMetric(key, "set", Date.now() - start);
    } catch (error) {
      this.recordFailure();
      logger.error(`[Cache] Error setting key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    this.initialize();
    if (!this.enabled || !this.redis) return;

    try {
      const start = Date.now();
      await this.redis.del(key);

      logger.debug(`[Cache] DEL: ${key}`);
      this.logMetric(key, "del", Date.now() - start);
    } catch (error) {
      logger.error(`[Cache] Error deleting key ${key}:`, error);
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN (non-blocking)
   *
   * Uses SCAN instead of KEYS to avoid blocking Redis on large keysets
   * See ANALYTICS_PR_REVIEW_ANALYSIS.md - Issue #7 (Fixed)
   *
   * @param pattern - Pattern to match (e.g., "org:*:cache")
   * @param batchSize - Number of keys to scan per iteration (default: 100)
   */
  async delPattern(pattern: string, batchSize = 100): Promise<void> {
    this.initialize();
    if (!this.enabled || !this.redis) return;

    try {
      const start = Date.now();
      let cursor: string | number = 0;
      let totalDeleted = 0;
      let iterations = 0;

      do {
        // Use SCAN instead of KEYS to avoid blocking Redis
        const result: [string | number, string[]] = await this.redis.scan(
          cursor,
          {
            match: pattern,
            count: batchSize,
          },
        );

        // result is [nextCursor, keys]
        // Upstash Redis returns cursor as string or number
        cursor =
          typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await this.redis.del(...keys);
          totalDeleted += keys.length;
          logger.debug(
            `[Cache] DEL_PATTERN iteration ${++iterations}: deleted ${keys.length} keys (total: ${totalDeleted})`,
          );
        }

        // Small delay to avoid overwhelming Redis
        if (cursor !== 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } while (cursor !== 0);

      const duration = Date.now() - start;

      if (totalDeleted === 0) {
        logger.debug(`[Cache] DEL_PATTERN: ${pattern} (no keys found)`);
      } else {
        logger.info(
          `[Cache] DEL_PATTERN: ${pattern} (deleted ${totalDeleted} keys in ${duration}ms, ${iterations} iterations)`,
        );
      }

      this.logMetric(pattern, "del_pattern", duration);
    } catch (error) {
      logger.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    }
  }

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    this.initialize();
    if (!this.enabled || !this.redis) return keys.map(() => null);

    try {
      const start = Date.now();
      const values = await this.redis.mget<string[]>(...keys);

      // Parse each JSON string value
      const parsed = values.map((value, index) => {
        if (value === null || value === undefined) return null;

        // Check for corrupted values
        if (typeof value === "string" && value === "[object Object]") {
          logger.warn(`[Cache] Corrupted cache value in mget for key ${keys[index]}, skipping`);
          this.del(keys[index]).catch(() => {});
          return null;
        }

        try {
          return typeof value === "string" ? JSON.parse(value) : value;
        } catch (parseError) {
          logger.warn(`[Cache] Failed to parse value in mget for key ${keys[index]}`, parseError);
          this.del(keys[index]).catch(() => {});
          return null;
        }
      });

      const hitCount = parsed.filter((v) => v !== null).length;
      logger.debug(`[Cache] MGET: ${keys.length} keys (${hitCount} hits)`);
      this.logMetric("mget", "hit", Date.now() - start, {
        keys: keys.length,
        hits: hitCount,
      });

      return parsed;
    } catch (error) {
      logger.error(`[Cache] Error in mget:`, error);
      return keys.map(() => null);
    }
  }

  private isCircuitOpen(): boolean {
    if (this.failureCount < this.MAX_FAILURES) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    if (timeSinceLastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
      logger.info(
        "[Cache] Circuit breaker timeout expired, attempting to reconnect",
      );
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
      logger.error(
        `[Cache] Circuit breaker OPENED after ${this.MAX_FAILURES} failures`,
      );
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
    key: string,
    operation: "hit" | "miss" | "set" | "del" | "del_pattern" | "stale",
    durationMs: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (durationMs > 100) {
      logger.warn(
        `[Cache] Slow ${operation}: ${key} (${durationMs}ms)`,
        { operation, durationMs, timestamp: new Date().toISOString(), ...metadata },
      );
    }
  }
}

export const cache = new CacheClient();
