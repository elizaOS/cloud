
import { cache, redis } from "./client";

/**
 * Atomically consume a cache key: delete it and return the number of keys removed.
 *
 * Returns 1 if the key existed and was deleted, 0 if it did not exist.
 *
 * Uses a single Redis DEL command which is atomic — it returns the number of
 * keys actually removed. This prevents TOCTOU race conditions where two
 * concurrent requests could both read the key before either deletes it.
 *
 * Falls back to get-then-delete if the raw Redis client is unavailable.
 */
export async function atomicConsume(key: string): Promise<number> {
  // Prefer raw Redis DEL for atomicity: DEL returns the count of keys removed
  // (1 if existed, 0 if not), making it a single atomic check-and-remove.
  if (redis) {
    try {
      const count = await redis.del(key);
      return count;
    } catch {
      // Fall through to non-atomic path
    }
  }

  // Fallback: non-atomic get+del (has a small TOCTOU window)
  const value = await cache.get(key);
  if (value === null || value === undefined) {
    return 0;
  }
  await cache.del(key);
  return 1;
}
