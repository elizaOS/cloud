/**
 * Cached Privy Client
 *
 * Wraps the Privy client with Redis caching for token verification.
 * This significantly reduces latency by avoiding repeated Privy API calls
 * for the same token within the cache window.
 *
 * Performance impact:
 * - Cache hit: ~5ms (Redis lookup only)
 * - Cache miss: ~100-200ms (Privy API call + Redis write)
 *
 * Security considerations:
 * - Short TTL (5 minutes) limits exposure if a token is revoked
 * - Token is hashed for cache key (raw token never stored)
 * - Cache invalidated on logout
 * - Only the essential claims are cached (not the full token)
 */

import { PrivyClient, type AuthTokenClaims } from "@privy-io/server-auth";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { InMemoryLRUCache } from "@/lib/cache/in-memory-lru-cache";
import { createHash } from "crypto";
import { logger } from "@/lib/utils/logger";

// Singleton Privy client
let _privyClient: PrivyClient | null = null;

/**
 * Get or create the Privy client instance
 */
export function getPrivyClient(): PrivyClient {
  if (!_privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        "Missing Privy credentials: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are required",
      );
    }

    _privyClient = new PrivyClient(appId, appSecret);
    logger.info("[PrivyClient] ✓ Privy client initialized");
  }

  return _privyClient;
}

/**
 * Cached Privy token claims
 * Only store what we need to avoid bloating the cache
 */
interface CachedPrivyClaims {
  /** Privy user ID (did:privy:xxx) */
  userId: string;
  /** App ID this token was issued for */
  appId: string;
  /** Token issuer */
  issuer: string;
  /** When the token was issued (unix timestamp) */
  issuedAt: number;
  /** When the token expires (unix timestamp) */
  expiration: number;
  /** When we cached this verification result */
  cachedAt: number;
}

/**
 * Hash a token for use as cache key
 * Never store raw tokens - use SHA256 hash truncated to 32 chars
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 32);
}

/**
 * PERF: In-memory LRU cache for Privy token verification (30s TTL, max 200).
 * Eliminates Redis round-trip for repeated requests from the same user
 * within the same serverless function instance. This saves ~5-30ms per request.
 */
const IN_MEMORY_PRIVY_CACHE = new InMemoryLRUCache<AuthTokenClaims>(200, 30_000);

/**
 * Verify a Privy auth token with caching
 *
 * Cache layers (fastest to slowest):
 * 1. In-memory cache: ~0ms (same serverless instance, 30s TTL)
 * 2. Redis cache: ~5ms (cross-instance, 5min TTL)
 * 3. Privy API: ~100-200ms (external API call)
 *
 * @param token - The Privy auth token from cookies or Authorization header
 * @returns Verified claims or null if invalid/expired
 */
export async function verifyAuthTokenCached(
  token: string,
): Promise<AuthTokenClaims | null> {
  const tokenHash = hashToken(token);
  const cacheKey = CacheKeys.session.privy(tokenHash);

  const startTime = Date.now();

  try {
    // 0. PERF: Check in-memory cache first (eliminates Redis round-trip)
    const inMemoryCached = IN_MEMORY_PRIVY_CACHE.get(tokenHash);
    if (inMemoryCached) {
      const now = Math.floor(Date.now() / 1000);
      if (inMemoryCached.expiration > now) {
        logger.debug("[PrivyClient] ✓ In-memory cache hit for token verification", {
          tokenHash: tokenHash.substring(0, 8),
          durationMs: Date.now() - startTime,
        });
        return inMemoryCached;
      }
    }

    // 1. Check Redis cache
    const cached = await cache.get<CachedPrivyClaims>(cacheKey);

    if (cached) {
      // Verify the cached token hasn't expired
      const now = Math.floor(Date.now() / 1000);
      if (cached.expiration > now) {
        logger.debug("[PrivyClient] ✓ Cache hit for token verification", {
          tokenHash: tokenHash.substring(0, 8),
          userId: cached.userId.substring(0, 20),
          durationMs: Date.now() - startTime,
        });

        // Return in the AuthTokenClaims format
        const redisCachedClaims = {
          userId: cached.userId,
          appId: cached.appId,
          issuer: cached.issuer,
          issuedAt: cached.issuedAt,
          expiration: cached.expiration,
        } as AuthTokenClaims;

        // PERF: Populate in-memory cache from Redis hit to avoid Redis round-trip next time
        IN_MEMORY_PRIVY_CACHE.set(tokenHash, redisCachedClaims);

        return redisCachedClaims;
      } else {
        // Token has expired, delete from cache
        logger.debug("[PrivyClient] Cached token expired, removing", {
          tokenHash: tokenHash.substring(0, 8),
        });
        await cache.del(cacheKey);
      }
    }

    // 2. Cache miss - verify with Privy API
    logger.debug("[PrivyClient] Cache miss, verifying with Privy API", {
      tokenHash: tokenHash.substring(0, 8),
    });

    const client = getPrivyClient();
    const claims = await client.verifyAuthToken(token);

    if (!claims) {
      logger.debug("[PrivyClient] Token verification failed - invalid token");
      return null;
    }

    // 3. Cache the result (both Redis and in-memory)
    // Calculate TTL: minimum of our configured TTL and token's remaining lifetime
    const now = Math.floor(Date.now() / 1000);
    const tokenRemainingSeconds = claims.expiration - now;
    const effectiveTtl = Math.min(
      CacheTTL.session.privy,
      tokenRemainingSeconds,
    );

    if (effectiveTtl > 0) {
      const cachedClaims: CachedPrivyClaims = {
        userId: claims.userId,
        appId: claims.appId,
        issuer: claims.issuer,
        issuedAt: claims.issuedAt,
        expiration: claims.expiration,
        cachedAt: Date.now(),
      };

      await cache.set(cacheKey, cachedClaims, effectiveTtl);

      logger.debug("[PrivyClient] ✓ Cached token verification result", {
        tokenHash: tokenHash.substring(0, 8),
        userId: claims.userId.substring(0, 20),
        ttlSeconds: effectiveTtl,
        durationMs: Date.now() - startTime,
      });
    }

    // PERF: Also cache in-memory for subsequent requests in the same instance
    IN_MEMORY_PRIVY_CACHE.set(tokenHash, claims);

    return claims;
  } catch (error) {
    // Distinguish expected token failures from unexpected errors
    const isExpectedFailure =
      error instanceof Error &&
      (error.message.includes("JWSInvalid") ||
        error.message.includes("JWTExpired") ||
        error.message.includes("JWTClaimValidationFailed") ||
        error.message.includes("Invalid Compact JWS") ||
        ("code" in error &&
          (error.code === "ERR_JWS_INVALID" ||
            error.code === "ERR_JWT_EXPIRED" ||
            error.code === "ERR_JWT_CLAIM_VALIDATION_FAILED")));

    if (isExpectedFailure) {
      logger.warn(
        "[PrivyClient] Token verification failed (invalid/expired token):",
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    }

    // Unexpected error — log at error level and try direct verification
    logger.error(
      "[PrivyClient] ✗ Token verification error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    // On error, try to verify directly without caching
    // This prevents cache issues from breaking auth entirely
    try {
      const client = getPrivyClient();
      return await client.verifyAuthToken(token);
    } catch {
      return null;
    }
  }
}

/**
 * Invalidate the cache for a specific token
 * Call this on logout to ensure immediate token invalidation
 *
 * @param token - The Privy auth token to invalidate
 */
export async function invalidatePrivyTokenCache(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  IN_MEMORY_PRIVY_CACHE.delete(tokenHash);

  await Promise.all([
    cache.del(CacheKeys.session.privy(tokenHash)),
    cache.del(CacheKeys.session.user(tokenHash)),
  ]);

  logger.debug("[PrivyClient] ✓ Invalidated token cache (in-memory + Redis)", {
    tokenHash: tokenHash.substring(0, 8),
  });
}

/**
 * Invalidate all session caches (admin operation)
 * Use with caution - this will force re-authentication for all users
 */
export async function invalidateAllPrivyTokenCaches(): Promise<void> {
  await cache.delPattern(CacheKeys.session.pattern());
  logger.warn("[PrivyClient] ⚠ Invalidated ALL session caches");
}

/**
 * Get user from Privy by ID token (more efficient, avoids rate limits)
 * This uses the privy-id-token cookie which is more efficient
 */
export async function getUserFromIdToken(idToken: string) {
  const client = getPrivyClient();
  return client.getUser({ idToken });
}

/**
 * Get user from Privy by user ID (counts against rate limits)
 * Use getUserFromIdToken when possible
 */
export async function getUserById(userId: string) {
  const client = getPrivyClient();
  return client.getUser(userId);
}

// Re-export the client for advanced use cases
export { getPrivyClient as privyClient };
