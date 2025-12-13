/**
 * Session Token Caching
 *
 * Caches session validation results to reduce load on Privy and the database.
 * Uses Redis with short TTLs to balance performance with security.
 *
 * Security considerations:
 * - Short TTL (5 minutes) limits exposure if a token is revoked
 * - Token hash is used as cache key (not the raw token)
 * - Cache is invalidated on logout
 */

import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";
import type { UserWithOrganization } from "@/lib/types";
import { logger } from "@/lib/utils/logger";

/**
 * Cached session data
 */
interface CachedSession {
  userId: string;
  privyId: string;
  isValid: boolean;
  cachedAt: number;
}

/**
 * Cached user data (after session validation)
 */
interface CachedUserData {
  user: UserWithOrganization;
  cachedAt: number;
}

/**
 * Create a hash of the session token for use as cache key
 * We don't store the raw token in cache keys for security
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 32);
}

/**
 * Cache a validated session token
 */
export async function cacheSessionValidation(
  token: string,
  userId: string,
  privyId: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const key = CacheKeys.session.privy(tokenHash);

  const data: CachedSession = {
    userId,
    privyId,
    isValid: true,
    cachedAt: Date.now(),
  };

  await cache.set(key, data, CacheTTL.session.privy);
  logger.debug("[SessionCache] Cached session validation", {
    tokenHash: tokenHash.substring(0, 8),
  });
}

/**
 * Get cached session validation result
 */
export async function getCachedSessionValidation(
  token: string,
): Promise<CachedSession | null> {
  const tokenHash = hashToken(token);
  const key = CacheKeys.session.privy(tokenHash);

  const cached = await cache.get<CachedSession>(key);

  if (cached) {
    logger.debug("[SessionCache] Cache hit for session validation", {
      tokenHash: tokenHash.substring(0, 8),
    });
  }

  return cached;
}

/**
 * Cache user data for a session token
 */
export async function cacheSessionUser(
  token: string,
  user: UserWithOrganization,
): Promise<void> {
  const tokenHash = hashToken(token);
  const key = CacheKeys.session.user(tokenHash);

  const data: CachedUserData = {
    user,
    cachedAt: Date.now(),
  };

  await cache.set(key, data, CacheTTL.session.user);
  logger.debug("[SessionCache] Cached user data for session", {
    tokenHash: tokenHash.substring(0, 8),
    userId: user.id,
  });
}

/**
 * Get cached user data for a session token
 */
export async function getCachedSessionUser(
  token: string,
): Promise<UserWithOrganization | null> {
  const tokenHash = hashToken(token);
  const key = CacheKeys.session.user(tokenHash);

  const cached = await cache.get<CachedUserData>(key);

  if (cached) {
    logger.debug("[SessionCache] Cache hit for user data", {
      tokenHash: tokenHash.substring(0, 8),
      userId: cached.user.id,
    });
    return cached.user;
  }

  return null;
}

/**
 * Invalidate session cache (call on logout)
 */
export async function invalidateSessionCache(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await Promise.all([
    cache.del(CacheKeys.session.privy(tokenHash)),
    cache.del(CacheKeys.session.user(tokenHash)),
  ]);

  logger.debug("[SessionCache] Invalidated session cache", {
    tokenHash: tokenHash.substring(0, 8),
  });
}

/**
 * Clear all session caches (admin operation)
 */
export async function clearAllSessionCaches(): Promise<void> {
  await cache.delPattern(CacheKeys.session.pattern());
  logger.info("[SessionCache] Cleared all session caches");
}
