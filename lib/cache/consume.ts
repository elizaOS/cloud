import { cache } from "@/lib/cache/client";
// Uses the CacheClient's underlying Redis instance for atomic DEL operations.
// We need the integer return value from DEL for single-use nonce consumption.

/**
 * Atomically consume a cache key by issuing a single Redis DEL command.
 * Returns the number of keys deleted (1 if the key existed, 0 if it did not).
 *
 * This is the correct primitive for single-use nonce consumption: a single DEL
 * is atomic, so two concurrent requests racing on the same nonce will see
 * exactly one return 1 and the other return 0. A get-then-delete sequence
 * would be vulnerable to TOCTOU races.
 */
export async function atomicConsume(key: string): Promise<number> {
  const redis = cache.getRedisClient();
  if (!redis) {
    throw new Error("Redis unavailable for nonce consumption");
  }
  try {
    // Use the raw Redis client's del() which returns the number of keys deleted.
    // CacheClient.del() returns void, which would break the integer check callers need.
    const deleted = await redis.del(key);
    return typeof deleted === "number" ? deleted : 0;
  } catch (error) {
    console.error("[atomicConsume] Redis DEL failed:", error);
    throw new Error("Redis DEL failed during nonce consumption");
  }
}
