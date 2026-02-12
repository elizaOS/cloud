
import { redis } from "./client";

/**
 * Atomically consume a cache key: delete it and return the number of keys removed.
 *
 * Returns 1 if the key existed and was deleted, 0 if it did not exist.
 * This prevents race conditions where two concurrent requests could both
 * read the key before either deletes it.
 *
 * Uses Redis DEL which is atomic — only one caller gets a return value of 1
 * for any given key. This is equivalent to GETDEL for our use case since
 * we only need to know whether the nonce existed, not its value.
 */
export async function atomicConsume(key: string): Promise<number> {
  // Use raw redis client which returns the delete count (0 or 1)
  // cache.del() returns void, so we need the underlying client
  return await redis.del(key);
}
