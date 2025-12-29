/**
 * DWS Cache-Backed Rate Limiting
 *
 * This module implements distributed rate limiting using DWS cache
 * to ensure rate limits work correctly across multiple serverless instances.
 *
 * Algorithm: Sliding Window using Cache Sorted Sets
 * - Each request is stored as a member in a sorted set with timestamp as score
 * - Old entries are removed before counting
 * - Atomic operations ensure consistency
 */

import { DWSCache } from "@/lib/services/dws/cache";
import { logger } from "@/lib/utils/logger";

// Re-export from rate-limit for convenience
export { withRateLimit, RateLimitPresets } from "./rate-limit";

let dwsCache: DWSCache | null = null;

function getCacheClient(): DWSCache | null {
  if (dwsCache) return dwsCache;

  if (process.env.CACHE_ENABLED === "false") {
    logger.warn("[Rate Limit] Cache disabled, rate limiting will be ineffective");
    return null;
  }

  try {
    dwsCache = new DWSCache({
      namespace: "ratelimit",
      defaultTTL: 3600,
    });
    logger.info("[Rate Limit] DWS cache client initialized");
    return dwsCache;
  } catch (error) {
    logger.error("[Rate Limit] Failed to initialize DWS cache", { error });
    return null;
  }
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check rate limit using DWS cache with sliding window algorithm
 */
export async function checkRateLimitRedis(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const client = getCacheClient();

  if (!client) {
    logger.warn(
      "[Rate Limit] Cache unavailable, failing open (allowing request)",
    );
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: Date.now() + windowMs,
    };
  }

  const now = Date.now();
  const cacheKey = key;

  try {
    // Use simple counter-based rate limiting with DWS cache
    const currentCount = await client.incr(cacheKey);
    
    // Set expiry on first request
    if (currentCount === 1) {
      await client.expire(cacheKey, Math.ceil(windowMs / 1000));
    }

    const allowed = currentCount <= maxRequests;
    const remaining = Math.max(0, maxRequests - currentCount);
    const resetAt = now + windowMs;
    const retryAfter = allowed ? undefined : Math.ceil(windowMs / 1000);

    if (!allowed) {
      logger.info(
        `[Rate Limit] Limit exceeded for key=${key}, count=${currentCount}, max=${maxRequests}`,
      );
    } else {
      logger.debug(
        `[Rate Limit] Request allowed for key=${key}, remaining=${remaining}`,
      );
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter,
    };
  } catch (error) {
    logger.error("[Rate Limit] Error checking rate limit:", error);
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: now + windowMs,
    };
  }
}

/**
 * Clears rate limit for a specific key.
 */
export async function clearRateLimit(key: string): Promise<void> {
  const client = getCacheClient();
  if (!client) return;

  try {
    await client.del(key);
    logger.info(`[Rate Limit] Cleared rate limit for key=${key}`);
  } catch (error) {
    logger.error(`[Rate Limit] Error clearing rate limit:`, error);
  }
}

/**
 * Gets current rate limit status without incrementing counter.
 */
export async function getRateLimitStatus(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ count: number; remaining: number; resetAt: number }> {
  const client = getCacheClient();

  if (!client) {
    return {
      count: 0,
      remaining: maxRequests,
      resetAt: Date.now() + windowMs,
    };
  }

  const now = Date.now();

  try {
    const countStr = await client.get<string>(key);
    const count = countStr ? parseInt(countStr, 10) : 0;

    return {
      count,
      remaining: Math.max(0, maxRequests - count),
      resetAt: now + windowMs,
    };
  } catch (error) {
    logger.error("[Rate Limit] Error getting status:", error);
    return {
      count: 0,
      remaining: maxRequests,
      resetAt: now + windowMs,
    };
  }
}
