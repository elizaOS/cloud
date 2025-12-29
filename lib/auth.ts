import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { userSessionsService } from "@/lib/services/user-sessions";
import { syncUserFromClaims, syncUserFromPrivy } from "./oauth3-sync";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import type { Organization } from "@/db/schemas/organizations";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { cache as redisCache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import {
  verifyOAuth3Token,
  invalidateOAuth3TokenCache,
  getOAuth3User,
  getUserById,
  type OAuth3TokenClaims,
} from "./auth/oauth3-client";

// Legacy compatibility aliases
export {
  verifyOAuth3Token as verifyAuthTokenCached,
  invalidateOAuth3TokenCache as invalidatePrivyTokenCache,
} from "./auth/oauth3-client";

// Re-export Organization type for convenience
export type { Organization };

// Cookie names
const OAUTH3_TOKEN_COOKIE = "oauth3-token";
const LEGACY_PRIVY_COOKIE = "privy-token";

/**
 * Hash a token for use as cache key (never store raw tokens)
 */
function hashToken(token: string): string {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .substring(0, 32);
}

/**
 * Invalidate user session cache (call when user/org data changes)
 * @param sessionToken - The session token to invalidate cache for
 */
export async function invalidateUserSessionCache(
  sessionToken: string,
): Promise<void> {
  const tokenHash = hashToken(sessionToken);
  const cacheKey = CacheKeys.session.user(tokenHash);
  await redisCache.del(cacheKey);
  logger.debug("[AUTH] Invalidated user session cache");
}

/**
 * Invalidate all caches for a session token (OAuth3 + user data)
 * Call this on logout to ensure immediate invalidation
 * @param sessionToken - The auth token to invalidate
 */
export async function invalidateSessionCaches(
  sessionToken: string,
): Promise<void> {
  await invalidateOAuth3TokenCache(sessionToken);
  logger.debug("[AUTH] Invalidated all session caches (OAuth3 + user)");
}

/**
 * Ensure user has a default API key for programmatic access
 * Creates one if it doesn't exist (for existing users who registered before auto-generation)
 */
async function ensureUserHasApiKey(
  userId: string,
  organizationId: string,
): Promise<void> {
  // Validate inputs
  if (!userId || userId.trim() === "") {
    logger.warn("[Auth] Invalid userId, skipping API key check");
    return;
  }

  if (!organizationId || organizationId.trim() === "") {
    logger.warn(
      `[Auth] No organization for user ${userId}, skipping API key check`,
    );
    return;
  }

  // Check if user already has an API key
  const existingKeys = await apiKeysService.listByOrganization(organizationId);
  const userHasKey = existingKeys.some((key) => key.user_id === userId);

  if (userHasKey) {
    return; // User already has a key
  }

  // Create default API key for existing user
  await apiKeysService.create({
    user_id: userId,
    organization_id: organizationId,
    name: "Default API Key",
    is_active: true,
  });
}

export type AuthResult = {
  user: UserWithOrganization;
  apiKey?: ApiKey;
  authMethod: "session" | "api_key";
  session_token?: string;
};

/**
 * Get the current authenticated user from OAuth3 token
 *
 * Performance optimized with Redis caching:
 * 1. Check Redis cache first (avoids OAuth3 API call AND DB call)
 * 2. On cache miss: verify with OAuth3, fetch from DB, cache result
 * 3. Session tracking is non-blocking to not slow down the response
 *
 * Flow (on cache miss):
 * 1. Verify OAuth3 token from cookies
 * 2. Look up user in database by OAuth3 identity ID
 * 3. If not found, create user from OAuth3 claims (just-in-time sync)
 * 4. Cache the user data in Redis
 * 5. Update session tracking (non-blocking)
 */
export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    try {
      // Get the auth token from cookies (check OAuth3 first, then legacy Privy)
      const cookieStore = await cookies();
      let authToken = cookieStore.get(OAUTH3_TOKEN_COOKIE);
      
      // Fallback to legacy Privy cookie for migration
      if (!authToken) {
        authToken = cookieStore.get(LEGACY_PRIVY_COOKIE);
      }

      if (!authToken) {
        return null;
      }

      const tokenHash = hashToken(authToken.value);
      const cacheKey = CacheKeys.session.user(tokenHash);

      // Check Redis cache first - avoids both OAuth3 API AND DB calls
      const cachedUser = await redisCache.get<UserWithOrganization>(cacheKey);
      if (cachedUser) {
        logger.debug("[AUTH] Cache hit for user session");

        // Update session tracking in background (non-blocking)
        if (cachedUser.organization_id) {
          void trackSessionActivity(
            cachedUser.id,
            cachedUser.organization_id,
            authToken.value,
          );
        }

        return cachedUser;
      }

      logger.debug("[AUTH] Cache miss, verifying with OAuth3 (cached)");

      // Verify the token with OAuth3 using cached verification
      const verifiedClaims = await verifyOAuth3Token(authToken.value);

      if (!verifiedClaims) {
        return null;
      }

      // Get user from database by OAuth3 identity ID
      // OAuth3 uses "oauth3:{identityId}" as the user identifier
      const oauth3UserId = `oauth3:${verifiedClaims.identityId}`;
      let user = await usersService.getByPrivyId(oauth3UserId);

      // Just-in-time sync: If user doesn't exist, create from claims
      if (!user) {
        logger.info(
          "[AUTH] User not in DB, starting JIT sync for:",
          verifiedClaims.identityId,
        );

        try {
          // Try to get full user data from OAuth3
          const oauth3User = await getOAuth3User(verifiedClaims.sessionId);

          if (oauth3User) {
            // Full user data available - import with all details
            const { syncUserFromOAuth3 } = await import("./oauth3-sync");
            user = await syncUserFromOAuth3(oauth3User);
          } else {
            // Just create from claims (minimal data)
            user = await syncUserFromClaims(verifiedClaims);
          }

          logger.info("[AUTH] JIT sync complete:", {
            userId: user.id,
            orgId: user.organization_id,
          });
        } catch (syncError) {
          logger.error(
            "[AUTH] Failed to sync user from OAuth3:",
            syncError instanceof Error ? syncError.message : syncError,
          );
        }
      }

      if (!user) {
        return null;
      }

      // Cache the user data in Redis (5 min TTL)
      await redisCache.set(cacheKey, user, CacheTTL.session.user);
      logger.debug("[AUTH] Cached user session data");

      // Handle session tracking and API key in background (non-blocking)
      if (user.organization_id) {
        void trackSessionActivity(
          user.id,
          user.organization_id,
          authToken.value,
        );
        void ensureUserHasApiKey(user.id, user.organization_id);
      } else {
        logger.error("[AUTH] User missing organization_id:", user.id);
      }

      return user;
    } catch (error) {
      logger.error(
        "[AUTH] Error:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  },
);

/**
 * Track session activity in background (non-blocking, debounced)
 * Uses Redis to debounce writes - only writes to DB every 60 seconds per session
 */
async function trackSessionActivity(
  userId: string,
  organizationId: string,
  sessionToken: string,
): Promise<void> {
  try {
    const tokenHash = hashToken(sessionToken);
    const debounceKey = `session:debounce:${tokenHash}`;

    // Check if we've tracked this session recently (within 60 seconds)
    const recentlyTracked = await redisCache.get<boolean>(debounceKey);
    if (recentlyTracked) {
      // Skip DB write - already tracked recently
      return;
    }

    // Mark as tracked for next 60 seconds
    await redisCache.set(debounceKey, true, 60);

    // Now do the actual DB upsert
    await userSessionsService.getOrCreateSession({
      user_id: userId,
      organization_id: organizationId,
      session_token: sessionToken,
    });
  } catch (error) {
    // Don't let session tracking failures affect the main request
    logger.warn(
      "[AUTH] Session tracking failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Require authentication - throws error if not authenticated
 * Note: This allows anonymous users. Use requireAuthWithOrg for paid features.
 */
export async function requireAuth(): Promise<UserWithOrganization> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized: Authentication required");
  }

  if (!user.is_active) {
    throw new Error("Forbidden: User account is inactive");
  }

  return user;
}

/**
 * Require authenticated user WITH organization (excludes anonymous users)
 * Use this for all paid features that require credits/billing
 */
export async function requireAuthWithOrg(): Promise<
  UserWithOrganization & { organization_id: string; organization: Organization }
> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized: Authentication required");
  }

  if (!user.is_active) {
    throw new Error("Forbidden: User account is inactive");
  }

  if (!user.organization_id) {
    throw new Error(
      "Forbidden: This feature requires a full account. Please sign up to continue.",
    );
  }

  if (!user.organization || !user.organization?.is_active) {
    throw new Error("Forbidden: Organization is inactive");
  }

  return user as UserWithOrganization & {
    organization_id: string;
    organization: Organization;
  };
}

/**
 * Require user to belong to a specific organization
 */
export async function requireOrganization(
  organizationId: string,
): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (user.organization_id !== organizationId) {
    throw new Error(
      `Forbidden: User does not have access to organization ${organizationId}`,
    );
  }

  if (!user.organization?.is_active) {
    throw new Error("Forbidden: Organization is inactive");
  }

  return user;
}

/**
 * Require user to have a specific role
 */
export async function requireRole(
  allowedRoles: string[],
): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden: User role ${user.role} is not in allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  return user;
}

/**
 * Get user from API key
 */
export async function getUserFromApiKey(
  apiKey: ApiKey,
): Promise<UserWithOrganization | null> {
  const user = await usersService.getWithOrganization(apiKey.user_id);
  if (!user) {
    return null;
  }
  return user;
}

/**
 * Require authentication via session or API key
 * Supports X-API-Key header, Authorization: Bearer header, and X-App-Token header
 * Note: This allows anonymous users. Use requireAuthOrApiKeyWithOrg for paid features.
 */
export async function requireAuthOrApiKey(
  request: NextRequest,
): Promise<AuthResult> {
  // Check for app token (pass-through auth from apps)
  const appToken = request.headers.get("X-App-Token");
  if (appToken) {
    const { appAuthSessionsService } =
      await import("@/lib/services/app-auth-sessions");
    const tokenData = await appAuthSessionsService.verifyToken(appToken);

    if (!tokenData) {
      throw new Error("Unauthorized: Invalid or expired app token");
    }

    // IMPORTANT: Use getWithOrganization to include org data for billing/credits
    const user = await usersService.getWithOrganization(tokenData.userId);

    if (!user) {
      throw new Error("Unauthorized: User not found");
    }

    if (!user.is_active) {
      throw new Error("Unauthorized: User account is inactive");
    }

    if (user.organization && !user.organization.is_active) {
      throw new Error("Forbidden: Organization is inactive");
    }

    return {
      user,
      authMethod: "api_key", // Treat as API key for billing purposes
    };
  }

  // Check for API key in X-API-Key header
  const apiKeyHeader = request.headers.get("X-API-Key");

  // Check for API key in Authorization header (standard)
  const authHeader = request.headers.get("authorization");
  let apiKeyValue: string | null = null;

  if (apiKeyHeader) {
    apiKeyValue = apiKeyHeader;
  } else if (authHeader?.startsWith("Bearer ")) {
    apiKeyValue = authHeader.substring(7);
  }

  if (apiKeyValue) {
    if (!apiKeyValue || apiKeyValue.trim().length === 0) {
      throw new Error("Invalid API key format");
    }

    const apiKey = await apiKeysService.validateApiKey(apiKeyValue);

    if (!apiKey) {
      throw new Error("Invalid or expired API key");
    }

    if (!apiKey.is_active) {
      throw new Error("API key is inactive");
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw new Error("API key has expired");
    }

    const user = await getUserFromApiKey(apiKey);

    if (!user) {
      throw new Error("User associated with API key not found");
    }

    if (!user.is_active) {
      throw new Error("User account is inactive");
    }

    if (!user.organization?.is_active) {
      throw new Error("Organization is inactive");
    }

    await apiKeysService.incrementUsage(apiKey.id);

    return {
      user,
      apiKey,
      authMethod: "api_key",
    };
  }

  // Fall back to session authentication
  const user = await requireAuth();

  // Get session token from cookies (check OAuth3 first, then legacy Privy)
  const cookieStore = await cookies();
  let authToken = cookieStore.get(OAUTH3_TOKEN_COOKIE);
  if (!authToken) {
    authToken = cookieStore.get(LEGACY_PRIVY_COOKIE);
  }

  return {
    user,
    authMethod: "session",
    session_token: authToken?.value,
  };
}

/**
 * Require authentication via session or API key WITH organization
 * Use this for paid features that require credits/billing
 */
export async function requireAuthOrApiKeyWithOrg(request: NextRequest): Promise<
  AuthResult & {
    user: UserWithOrganization & {
      organization_id: string;
      organization: Organization;
    };
  }
> {
  const result = await requireAuthOrApiKey(request);

  if (!result.user.organization_id || !result.user.organization) {
    throw new Error(
      "Forbidden: This feature requires a full account. Please sign up to continue.",
    );
  }

  return result as AuthResult & {
    user: UserWithOrganization & {
      organization_id: string;
      organization: Organization;
    };
  };
}

/**
 * Verify an OAuth3 auth token directly (for API routes)
 * Uses cached verification to avoid repeated OAuth3 API calls
 */
export async function verifyPrivyToken(token: string): Promise<OAuth3TokenClaims | null> {
  return verifyOAuth3Token(token);
}

/**
 * Get user from request headers (for API routes)
 */
export async function getUserFromRequest(
  request: NextRequest,
): Promise<UserWithOrganization | null> {
  // Check Authorization header for OAuth3 token
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const claims = await verifyOAuth3Token(token);

    if (claims) {
      // Get user from database
      const oauth3UserId = `oauth3:${claims.identityId}`;
      const user = await usersService.getByPrivyId(oauth3UserId);
      return user ?? null;
    }
  }

  // Check cookies
  return getCurrentUser();
}

// Re-export x402 utilities for permissionless access
export {
  requireCreditsWithX402Fallback,
  hasX402Payment,
  getX402Price,
  generate402Response,
  refundIfCredits,
  chargeAdditionalIfCredits,
  type PaymentContext,
} from "./auth/x402-or-credits";

// Admin authentication - requires wallet connection and admin role
import { adminService } from "@/lib/services/admin";

export interface AdminAuthResult {
  user: UserWithOrganization;
  isAdmin: boolean;
  role: string | null;
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AdminAuthResult> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.wallet_address) {
    throw new Error("Wallet connection required for admin access");
  }

  // Single cached call instead of two separate DB queries
  const { isAdmin, role } = await adminService.getAdminStatus(
    user.wallet_address,
  );

  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return { user, isAdmin: true, role };
}

// Re-export app authentication utilities
export { requireAppAuth, verifyAppToken } from "./middleware/app-auth";

// Legacy compatibility re-exports (use oauth3-client directly for new code)
export {
  verifyOAuth3Token as verifyAuthToken,
  invalidateOAuth3TokenCache,
  getOAuth3User,
  getUserById,
  type OAuth3TokenClaims,
} from "./auth/oauth3-client";

// Export a compatibility function for getPrivyClient
export function getPrivyClient() {
  return {
    verifyAuthToken: verifyOAuth3Token,
    getUser: getUserById,
  };
}

// Export for legacy code that imports invalidateAllPrivyTokenCaches
export { invalidateAllOAuth3TokenCaches as invalidateAllPrivyTokenCaches } from "./auth/oauth3-client";
