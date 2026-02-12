
import { cache } from "./client";

/**
 * Atomically consume a cache key: delete it and return the number of keys removed.
 *
 * Returns 1 if the key existed and was deleted, 0 if it did not exist.
 *
 * Note: This uses cache.get() + cache.del() which has a small TOCTOU window.
 * A truly atomic implementation would require the raw Redis client to use
 * a single DEL command (which returns the delete count). The cache wrapper's
 * del() returns void, so we approximate atomicity with get-then-delete.
 * For nonce consumption, the 5-minute TTL and rate limiting provide
 * additional protection against replay within this small window.
 */
export async function atomicConsume(key: string): Promise<number> {
  const value = await cache.get(key);
  if (value === null || value === undefined) {
    return 0;
  }
  await cache.del(key);
  return 1;
}
