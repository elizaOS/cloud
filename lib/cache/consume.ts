import { cache, redis } from "./client";

/**
 * Atomically consume a cache key (delete and return whether it existed).
 * Returns true if the key existed and was deleted, false otherwise.
 *
 * Uses the raw Redis client's DEL command which returns the count of keys
 * deleted (1 or 0), making this truly atomic - no race condition between
 * check and delete. We bypass the CacheClient wrapper because its del()
 * method returns Promise<void>, discarding the deletion count.
 */
export async function atomicConsume(key: string): Promise<boolean> {
  if (!cache.isAvailable() || !redis) {
    return false;
  }

  // Redis DEL returns number of keys deleted (1 if existed, 0 if not)
  const deleted = await redis.del(key);
  return deleted === 1;
}

