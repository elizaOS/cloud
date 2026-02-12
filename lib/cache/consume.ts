
import { cache } from "./client";

/**
 * Atomically consume a cache key (get and delete in one operation).
 * Returns true if the key existed and was deleted, false otherwise.
 * 
 * This prevents race conditions where two concurrent requests could both
 * pass a get() check before either deletes the key.
 */
export async function atomicConsume(key: string): Promise<boolean> {
  if (!cache.isAvailable()) {
    return false;
  }
  
  const exists = await cache.get(key);
  if (!exists) {
    return false;
  }
  
  await cache.del(key);
  return true;
}
