import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";

export class CacheClient {
  private redis: Redis | null = null;
  private enabled: boolean | null = null;
  private initialized: boolean = false;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000;

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.enabled = process.env.CACHE_ENABLED !== "false";

    if (!this.enabled) {
      logger.warn("[Cache] Caching is disabled via CACHE_ENABLED flag");
      return;
    }

    if (
      !process.env.KV_REST_API_URL ||
      !process.env.KV_REST_API_TOKEN
    ) {
      logger.error(
        "[Cache] Missing Upstash credentials, caching disabled. Set KV_REST_API_URL and KV_REST_API_TOKEN"
      );
      this.enabled = false;
      return;
    }

    this.redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    logger.info("[Cache] Cache client initialized with Upstash Redis");
  }

  async get<T>(key: string): Promise<T | null> {
    this.initialize();
    if (!this.enabled || !this.redis || this.isCircuitOpen()) return null;

    try {
      const start = Date.now();
      const value = await this.redis.get<T>(key);

      if (value === null || value === undefined) {
        logger.debug(`[Cache] MISS: ${key}`);
        this.logMetric(key, "miss", Date.now() - start);
        return null;
      }

      if (!this.isValidCacheValue(value)) {
        logger.warn(`[Cache] Invalid cached value for key ${key}, deleting`);
        await this.del(key);
        return null;
      }

      this.resetFailures();
      logger.debug(`[Cache] HIT: ${key}`);
      this.logMetric(key, "hit", Date.now() - start);
      return value;
    } catch (error) {
      this.recordFailure();
      logger.error(`[Cache] Error getting key ${key}:`, error);
      await this.del(key).catch(() => {});
      return null;
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

      const start = Date.now();
      await this.redis.setex(key, ttlSeconds, value);

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

  async delPattern(pattern: string): Promise<void> {
    this.initialize();
    if (!this.enabled || !this.redis) return;

    try {
      const start = Date.now();
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        logger.debug(`[Cache] DEL_PATTERN: ${pattern} (no keys found)`);
        return;
      }

      await this.redis.del(...keys);
      logger.info(
        `[Cache] DEL_PATTERN: ${pattern} (deleted ${keys.length} keys)`
      );
      this.logMetric(pattern, "del_pattern", Date.now() - start);
    } catch (error) {
      logger.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    }
  }

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    this.initialize();
    if (!this.enabled || !this.redis) return keys.map(() => null);

    try {
      const start = Date.now();
      const values = await this.redis.mget<T[]>(...keys);

      const hitCount = values.filter((v) => v !== null).length;
      logger.debug(`[Cache] MGET: ${keys.length} keys (${hitCount} hits)`);
      this.logMetric("mget", "hit", Date.now() - start, {
        keys: keys.length,
        hits: hitCount,
      });

      return values;
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
        "[Cache] Circuit breaker timeout expired, attempting to reconnect"
      );
      this.failureCount = 0;
      return false;
    }

    logger.warn(
      `[Cache] Circuit breaker OPEN (${this.failureCount} failures, retry in ${Math.ceil((this.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s)`
    );
    return true;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount === this.MAX_FAILURES) {
      logger.error(
        `[Cache] Circuit breaker OPENED after ${this.MAX_FAILURES} failures`
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
    operation: "hit" | "miss" | "set" | "del" | "del_pattern",
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    const metricData = {
      key,
      operation,
      durationMs,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    if (durationMs > 100) {
      logger.warn(
        `[Cache] Slow ${operation}: ${key} (${durationMs}ms)`,
        metricData
      );
    }
  }
}

export const cache = new CacheClient();
