
/**
 * Atomic consume operation for cache entries.
 * Returns true if the key existed and was deleted, false otherwise.
 * This prevents TOCTOU race conditions in nonce validation.
 */
import { cache } from "./client";

export async function atomicConsume(key: string): Promise<boolean> {
  if (!cache.isAvailable()) {
    return false;
  }
  
  try {
    // Redis DEL returns the number of keys deleted (1 if existed, 0 if not)
    const deleted = await cache.del(key);
    return deleted === 1;
  } catch {
    return false;
  }
}
