
/**
 * Atomic consume operation for cache entries.
 * Returns true if the key existed and was deleted, false otherwise.
 * This prevents TOCTOU race conditions in nonce validation.
 */
import { redis } from "./client";

export async function atomicConsume(key: string): Promise<boolean> {
  if (!redis) {
    return false;
  }
  
  try {
    // Redis DEL returns the number of keys deleted (1 if existed, 0 if not)
    const deleted = await redis.del(key);
    return deleted === 1;
  } catch {
    return false;
  }
}
