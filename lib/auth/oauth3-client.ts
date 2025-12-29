/**
 * OAuth3 Client
 *
 * Handles OAuth3 token verification and session management.
 * Replaces Privy client with decentralized OAuth3 authentication.
 */

import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";
import { logger } from "@/lib/utils/logger";
import type { Address, Hex } from "viem";

// OAuth3 Agent endpoint
const OAUTH3_AGENT_URL = process.env.OAUTH3_AGENT_URL ?? "http://localhost:4200";

export interface OAuth3TokenClaims {
  sessionId: Hex;
  identityId: Hex;
  smartAccount: Address;
  expiresAt: number;
  provider: string;
  providerId: string;
  providerHandle: string;
  appId: string;
  issuedAt: number;
}

export interface OAuth3User {
  identityId: Hex;
  smartAccount: Address;
  provider: string;
  providerId: string;
  providerHandle: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  farcasterFid?: number;
  farcasterUsername?: string;
  linkedAccounts: Array<{
    provider: string;
    providerId: string;
    handle: string;
  }>;
}

/**
 * Hash a token for use as cache key (never store raw tokens)
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 32);
}

/**
 * Verify an OAuth3 session token
 */
export async function verifyOAuth3Token(
  token: string
): Promise<OAuth3TokenClaims | null> {
  const tokenHash = hashToken(token);
  const cacheKey = CacheKeys.session.oauth3(tokenHash);

  const startTime = Date.now();

  try {
    // Check cache first
    const cached = await cache.get<OAuth3TokenClaims>(cacheKey);

    if (cached) {
      const now = Math.floor(Date.now() / 1000);
      if (cached.expiresAt > now) {
        logger.debug("[OAuth3Client] Cache hit for token verification", {
          tokenHash: tokenHash.substring(0, 8),
          durationMs: Date.now() - startTime,
        });
        return cached;
      } else {
        // Token expired, remove from cache
        await cache.del(cacheKey);
      }
    }

    // Cache miss - verify with OAuth3 Agent
    logger.debug("[OAuth3Client] Cache miss, verifying with OAuth3 Agent", {
      tokenHash: tokenHash.substring(0, 8),
    });

    // Try /session/verify endpoint first (for JWT access tokens)
    let response = await fetch(`${OAUTH3_AGENT_URL}/session/verify?token=${encodeURIComponent(token)}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      // Fallback to /oauth/userinfo endpoint (standard OAuth2)
      response = await fetch(`${OAUTH3_AGENT_URL}/oauth/userinfo`, {
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 404) {
        logger.debug("[OAuth3Client] Session not found or invalid");
        return null;
      }
      throw new Error(`OAuth3 verification failed: ${response.status}`);
    }

    const session = await response.json();

    // Handle both /session/verify and /oauth/userinfo response formats
    const expiresAt = session.expiresAt ?? session.exp ?? (Date.now() + 3600000);
    const userId = session.userId ?? session.sub ?? "";
    
    // Check expiration
    if (expiresAt < Date.now()) {
      logger.debug("[OAuth3Client] Session expired");
      return null;
    }

    // Parse userId to extract provider info (format: "provider:id")
    const [provider, providerId] = userId.includes(":") 
      ? userId.split(":", 2) 
      : ["wallet", userId];

    const claims: OAuth3TokenClaims = {
      sessionId: (session.sessionId ?? token) as Hex,
      identityId: userId as Hex,
      smartAccount: (session.address ?? session.smartAccount ?? "0x0000000000000000000000000000000000000000") as Address,
      expiresAt: Math.floor(expiresAt / 1000),
      provider: session.provider ?? provider,
      providerId: session.providerId ?? providerId,
      providerHandle: session.providerHandle ?? session.address ?? providerId,
      appId: session.appId ?? "eliza-cloud",
      issuedAt: Math.floor((session.createdAt ?? session.iat ?? Date.now()) / 1000),
    };

    // Cache the result
    const ttl = Math.min(
      CacheTTL.session.oauth3,
      claims.expiresAt - Math.floor(Date.now() / 1000)
    );

    if (ttl > 0) {
      await cache.set(cacheKey, claims, ttl);
    }

    logger.debug("[OAuth3Client] Token verified and cached", {
      tokenHash: tokenHash.substring(0, 8),
      identityId: claims.identityId.substring(0, 16),
      durationMs: Date.now() - startTime,
    });

    return claims;
  } catch (error) {
    logger.error(
      "[OAuth3Client] Token verification error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Verify OAuth3 token with caching (alias for verifyOAuth3Token)
 */
export const verifyAuthTokenCached = verifyOAuth3Token;

/**
 * Get user data from OAuth3 session
 */
export async function getOAuth3User(sessionId: string): Promise<OAuth3User | null> {
  try {
    const response = await fetch(`${OAUTH3_AGENT_URL}/session/${sessionId}/user`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    logger.error(
      "[OAuth3Client] Get user error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Get user by identity ID
 */
export async function getUserById(identityId: string): Promise<OAuth3User | null> {
  try {
    const response = await fetch(`${OAUTH3_AGENT_URL}/identity/${identityId}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    logger.error(
      "[OAuth3Client] Get user by ID error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Invalidate OAuth3 token cache
 */
export async function invalidateOAuth3TokenCache(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const cacheKey = CacheKeys.session.oauth3(tokenHash);
  await cache.del(cacheKey);
  logger.debug("[OAuth3Client] Invalidated token cache", {
    tokenHash: tokenHash.substring(0, 8),
  });
}

/**
 * Alias for invalidateOAuth3TokenCache (Privy compatibility)
 */
export const invalidatePrivyTokenCache = invalidateOAuth3TokenCache;

/**
 * Invalidate all OAuth3 token caches for a user
 */
export async function invalidateAllOAuth3TokenCaches(
  identityId: string
): Promise<void> {
  // This would need Redis SCAN to find all tokens for this user
  // For now, just log - tokens will expire naturally
  logger.info("[OAuth3Client] Token invalidation requested for identity", {
    identityId: identityId.substring(0, 16),
  });
}

/**
 * Alias for Privy compatibility
 */
export const invalidateAllPrivyTokenCaches = invalidateAllOAuth3TokenCaches;

/**
 * Revoke OAuth3 session
 */
export async function revokeOAuth3Session(sessionId: string): Promise<void> {
  try {
    await fetch(`${OAUTH3_AGENT_URL}/session/${sessionId}`, {
      method: "DELETE",
    });
    logger.info("[OAuth3Client] Session revoked", {
      sessionId: sessionId.substring(0, 16),
    });
  } catch (error) {
    logger.error(
      "[OAuth3Client] Session revoke error:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Get OAuth3 client singleton (for Privy compatibility)
 */
export function getPrivyClient() {
  // Return a mock object for compatibility
  // All actual calls should go through the typed functions above
  return {
    verifyAuthToken: verifyOAuth3Token,
    getUser: getUserById,
  };
}

/**
 * Get user from ID token (Privy compatibility)
 */
export async function getUserFromIdToken(
  idToken: string
): Promise<OAuth3User | null> {
  // OAuth3 doesn't have separate ID tokens - use session verification
  const claims = await verifyOAuth3Token(idToken);
  if (!claims) {
    return null;
  }
  return getOAuth3User(claims.sessionId);
}

