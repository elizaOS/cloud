/**
 * Steward JWT Verification with Redis Caching
 *
 * Mirrors privy-client.ts pattern for Steward session tokens.
 * Steward issues JWTs after authentication; this module verifies them
 * with caching to avoid redundant crypto operations.
 *
 * Performance impact:
 * - Cache hit (in-memory): ~0ms
 * - Cache hit (Redis): ~5ms
 * - Cache miss: ~1-5ms (local JWT verify, no third-party API call)
 *
 * Security considerations:
 * - Short TTL (5 minutes) limits exposure if a token is revoked
 * - Token is hashed for cache key (raw token never stored)
 * - Only essential claims are cached
 * - Falls back gracefully on missing secret (logs warning, returns null)
 */

import { createHash } from "crypto";
import { type JWTPayload, jwtVerify } from "jose";
import { cache } from "@/lib/cache/client";
import { InMemoryLRUCache } from "@/lib/cache/in-memory-lru-cache";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

/**
 * Claims extracted from a verified Steward JWT.
 * Maps to the fields Steward encodes in its session tokens.
 */
export interface StewardTokenClaims {
  /** Steward user ID (sub claim) */
  userId: string;
  /** User email, if present */
  email?: string;
  /** Wallet address, if present */
  address?: string;
  /** Tenant/org scope, if present */
  tenantId?: string;
  /** Token expiration (unix timestamp) */
  expiration: number;
  /** Token issued-at (unix timestamp) */
  issuedAt: number;
}

/**
 * Cached representation of verified Steward claims.
 * Mirrors CachedPrivyClaims structure for consistency.
 */
interface CachedStewardClaims {
  userId: string;
  email?: string;
  address?: string;
  tenantId?: string;
  expiration: number;
  issuedAt: number;
  cachedAt: number;
}

// Lazy-init the secret so we don't throw on import when env vars are absent
let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array | null {
  if (_jwtSecret) return _jwtSecret;

  const raw =
    process.env.STEWARD_SESSION_SECRET || process.env.STEWARD_JWT_SECRET || "";

  if (!raw) {
    logger.warn(
      "[StewardClient] No STEWARD_SESSION_SECRET or STEWARD_JWT_SECRET configured",
    );
    return null;
  }

  _jwtSecret = new TextEncoder().encode(raw);
  return _jwtSecret;
}

/**
 * Hash a token for use as cache key.
 * Never store raw tokens; use SHA256 hash truncated to 32 chars.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 32);
}

/**
 * In-memory LRU cache for Steward token verification (30s TTL, max 200).
 * Eliminates Redis round-trip for repeated requests within the same
 * serverless function instance.
 */
const IN_MEMORY_STEWARD_CACHE = new InMemoryLRUCache<StewardTokenClaims>(
  200,
  30_000,
);

/**
 * Extract StewardTokenClaims from a raw jose JWTPayload.
 */
function extractClaims(payload: JWTPayload): StewardTokenClaims {
  return {
    userId: (payload.sub ?? payload.userId ?? "") as string,
    email: payload.email as string | undefined,
    address: payload.address as string | undefined,
    tenantId: (payload.tenantId ?? payload.tenant_id) as string | undefined,
    expiration: payload.exp ?? 0,
    issuedAt: payload.iat ?? 0,
  };
}

/**
 * Verify a Steward JWT with caching.
 *
 * Cache layers (fastest to slowest):
 * 1. In-memory LRU: ~0ms (same serverless instance, 30s TTL)
 * 2. Redis: ~5ms (cross-instance, 5min TTL)
 * 3. Local jose verify: ~1-5ms (no third-party API call)
 *
 * @param token - The Steward JWT from Authorization header
 * @returns Verified claims or null if invalid/expired/missing secret
 */
export async function verifyStewardTokenCached(
  token: string,
): Promise<StewardTokenClaims | null> {
  const secret = getJwtSecret();
  if (!secret) return null;

  const tokenHash = hashToken(token);
  const cacheKey = CacheKeys.session.steward(tokenHash);
  const now = Math.floor(Date.now() / 1000);
  const startTime = Date.now();

  try {
    // 0. Check in-memory cache first
    const inMemoryCached = IN_MEMORY_STEWARD_CACHE.get(tokenHash);
    if (inMemoryCached && inMemoryCached.expiration > now) {
      logger.debug("[StewardClient] ✓ In-memory cache hit", {
        tokenHash: tokenHash.substring(0, 8),
        durationMs: Date.now() - startTime,
      });
      return inMemoryCached;
    }

    // 1. Check Redis cache
    const cached = await cache.get<CachedStewardClaims>(cacheKey);
    if (cached && cached.expiration > now) {
      logger.debug("[StewardClient] ✓ Redis cache hit", {
        tokenHash: tokenHash.substring(0, 8),
        userId: cached.userId.substring(0, 20),
        durationMs: Date.now() - startTime,
      });

      const claims: StewardTokenClaims = {
        userId: cached.userId,
        email: cached.email,
        address: cached.address,
        tenantId: cached.tenantId,
        expiration: cached.expiration,
        issuedAt: cached.issuedAt,
      };

      // Populate in-memory cache from Redis hit
      IN_MEMORY_STEWARD_CACHE.set(tokenHash, claims);
      return claims;
    }

    if (cached) {
      // Expired entry, clean up
      await cache.del(cacheKey);
    }

    // 2. Cache miss: verify JWT with jose
    logger.debug("[StewardClient] Cache miss, verifying JWT locally", {
      tokenHash: tokenHash.substring(0, 8),
    });

    const { payload } = await jwtVerify(token, secret, {
      // Accept HS256 (symmetric) and RS256/ES256 if needed in future
      algorithms: ["HS256"],
    });

    const claims = extractClaims(payload);

    if (!claims.userId) {
      logger.warn("[StewardClient] JWT valid but missing userId/sub claim");
      return null;
    }

    // 3. Cache the result
    const tokenRemainingSeconds = claims.expiration - now;
    const effectiveTtl = Math.min(
      CacheTTL.session.steward,
      tokenRemainingSeconds,
    );

    if (effectiveTtl > 0) {
      const cachedClaims: CachedStewardClaims = {
        ...claims,
        cachedAt: Date.now(),
      };

      await cache.set(cacheKey, cachedClaims, effectiveTtl);

      logger.debug("[StewardClient] ✓ Cached verification result", {
        tokenHash: tokenHash.substring(0, 8),
        userId: claims.userId.substring(0, 20),
        ttlSeconds: effectiveTtl,
        durationMs: Date.now() - startTime,
      });
    }

    // Also cache in-memory
    IN_MEMORY_STEWARD_CACHE.set(tokenHash, claims);

    return claims;
  } catch (error) {
    const isExpectedFailure =
      error instanceof Error &&
      (error.message.includes("JWSInvalid") ||
        error.message.includes("JWTExpired") ||
        error.message.includes("JWTClaimValidationFailed") ||
        error.message.includes("Invalid Compact JWS") ||
        error.message.includes("signature verification failed") ||
        ("code" in error &&
          (error.code === "ERR_JWS_INVALID" ||
            error.code === "ERR_JWT_EXPIRED" ||
            error.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" ||
            error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED")));

    if (isExpectedFailure) {
      logger.debug(
        "[StewardClient] Token verification failed (invalid/expired):",
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    }

    logger.error(
      "[StewardClient] ✗ Unexpected verification error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

/**
 * Invalidate the cache for a specific Steward token.
 * Call on logout to ensure immediate token invalidation.
 */
export async function invalidateStewardTokenCache(
  token: string,
): Promise<void> {
  const tokenHash = hashToken(token);

  IN_MEMORY_STEWARD_CACHE.delete(tokenHash);

  await Promise.all([
    cache.del(CacheKeys.session.steward(tokenHash)),
    cache.del(CacheKeys.session.user(tokenHash)),
  ]);

  logger.debug(
    "[StewardClient] ✓ Invalidated token cache (in-memory + Redis)",
    {
      tokenHash: tokenHash.substring(0, 8),
    },
  );
}
