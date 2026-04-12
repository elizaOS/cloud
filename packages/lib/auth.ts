import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { cache } from "react";
import type { Organization } from "@/db/schemas/organizations";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { cache as redisCache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { adminService } from "@/lib/services/admin";
import { apiKeysService } from "@/lib/services/api-keys";
import { userSessionsService } from "@/lib/services/user-sessions";
import { usersService } from "@/lib/services/users";
import type { ApiKey, UserWithOrganization } from "@/lib/types";
import { logger } from "@/lib/utils/logger";
import {
  isPlaywrightTestAuthEnabled,
  PLAYWRIGHT_TEST_SESSION_COOKIE_NAME,
  verifyPlaywrightTestSessionToken,
} from "./auth/playwright-test-session";
import {
  getUserById,
  getUserFromIdToken,
  invalidatePrivyTokenCache,
  verifyAuthTokenCached,
} from "./auth/privy-client";
import { invalidateStewardTokenCache, verifyStewardTokenCached } from "./auth/steward-client";

// TODO: Import syncUserFromSteward once steward-sync module is created
// import { syncUserFromSteward } from "./steward-sync";

// Re-export Organization type for convenience
export type { Organization };

/**
 * Hash a token for use as cache key (never store raw tokens)
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").substring(0, 32);
}

/**
 * Invalidate user session cache (call when user/org data changes)
 * @param sessionToken - The session token to invalidate cache for
 */
export async function invalidateUserSessionCache(sessionToken: string): Promise<void> {
  const tokenHash = hashToken(sessionToken);
  const cacheKey = CacheKeys.session.user(tokenHash);
  await redisCache.del(cacheKey);
  logger.debug("[AUTH] Invalidated user session cache");
}

/**
 * Invalidate all caches for a session token (Privy + user data)
 * Call this on logout to ensure immediate invalidation
 * @param sessionToken - The Privy auth token to invalidate
 */
export async function invalidateSessionCaches(sessionToken: string): Promise<void> {
  await Promise.all([
    invalidatePrivyTokenCache(sessionToken),
    invalidateStewardTokenCache(sessionToken),
  ]);
  logger.debug("[AUTH] Invalidated all session caches (Privy + Steward + user)");
}

/**
 * Ensure user has a default API key for programmatic access
 * Creates one if it doesn't exist (for existing users who registered before auto-generation)
 */
async function ensureUserHasApiKey(userId: string, organizationId: string): Promise<void> {
  // Validate inputs
  if (!userId || userId.trim() === "") {
    logger.warn("[Auth] Invalid userId, skipping API key check");
    return;
  }

  if (!organizationId || organizationId.trim() === "") {
    logger.warn(`[Auth] No organization for user ${userId}, skipping API key check`);
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
  authMethod: "session" | "api_key" | "wallet_signature";
  session_token?: string;
};

let privySyncLoader:
  | null
  | (() => Promise<typeof import("./privy-sync")>) = null;

async function loadPrivySyncModule(): Promise<typeof import("./privy-sync")> {
  if (!privySyncLoader) {
    privySyncLoader = new Function(
      "return import('./privy-sync');",
    ) as () => Promise<typeof import("./privy-sync")>;
  }

  return await privySyncLoader();
}

async function getPlaywrightTestUser(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<UserWithOrganization | null> {
  if (!isPlaywrightTestAuthEnabled()) {
    return null;
  }

  const testSession = cookieStore.get(PLAYWRIGHT_TEST_SESSION_COOKIE_NAME)?.value;
  if (!testSession) {
    return null;
  }

  const claims = verifyPlaywrightTestSessionToken(testSession);
  if (!claims) {
    return null;
  }

  const user = await usersService.getWithOrganization(claims.userId);
  if (!user || !user.is_active || !user.organization?.is_active) {
    return null;
  }

  if (user.organization_id !== claims.organizationId) {
    logger.warn("[AUTH] Playwright test session organization mismatch", {
      userId: claims.userId,
      organizationId: claims.organizationId,
    });
    return null;
  }

  return user;
}

/**
 * Get the current authenticated user from Privy token
 *
 * Performance optimized with Redis caching:
 * 1. Check Redis cache first (avoids Privy API call AND DB call)
 * 2. On cache miss: verify with Privy, fetch from DB, cache result
 * 3. Session tracking is non-blocking to not slow down the response
 *
 * Flow (on cache miss):
 * 1. Verify Privy token from cookies
 * 2. Look up user in database by Privy ID
 * 3. If not found, fetch full user data from Privy API (just-in-time sync)
 * 4. Cache the user data in Redis
 * 5. Update session tracking (non-blocking)
 *
 * This handles the race condition where webhooks haven't fired yet.
 */
export const getCurrentUser = cache(async (): Promise<UserWithOrganization | null> => {
  try {
    const cookieStore = await cookies();
    const playwrightTestUser = await getPlaywrightTestUser(cookieStore);
    if (playwrightTestUser) {
      return playwrightTestUser;
    }

    // Get the auth token from cookies
    const authToken = cookieStore.get("privy-token");

    if (!authToken) {
      return null;
    }

    const tokenHash = hashToken(authToken.value);
    const cacheKey = CacheKeys.session.user(tokenHash);

    // Check Redis cache first - avoids both Privy API AND DB calls
    const cachedUser = await redisCache.get<UserWithOrganization>(cacheKey);
    if (cachedUser) {
      logger.debug("[AUTH] Cache hit for user session");

      // Update session tracking in background (non-blocking)
      if (cachedUser.organization_id) {
        void trackSessionActivity(cachedUser.id, cachedUser.organization_id, authToken.value);
      }

      return cachedUser;
    }

    logger.debug("[AUTH] Cache miss, verifying with Privy (cached)");

    // Verify the token with Privy using cached verification
    // This caches the Privy API response to avoid repeated network calls
    const verifiedClaims = await verifyAuthTokenCached(authToken.value);

    if (!verifiedClaims) {
      return null;
    }

    // Get user from database by Privy ID
    let user = await usersService.getByPrivyId(verifiedClaims.userId);

    // Just-in-time sync: If user doesn't exist, fetch from Privy and create
    // This handles race conditions where webhooks haven't fired yet
    if (!user) {
      logger.info("[AUTH] User not in DB, starting JIT sync for:", verifiedClaims.userId);

      try {
        let privyUser = null;

        // Try efficient method first: use privy-id-token to avoid rate limits
        const idToken = cookieStore.get("privy-id-token");
        if (idToken?.value) {
          logger.debug("[AUTH] Using privy-id-token for user lookup");
          try {
            privyUser = await getUserFromIdToken(idToken.value);
          } catch (_idTokenError) {
            logger.warn("[AUTH] privy-id-token method failed, will fallback to userId");
          }
        }

        // Fallback: use userId directly (counts against rate limits)
        if (!privyUser) {
          logger.debug("[AUTH] Using userId for user lookup (fallback)");
          privyUser = await getUserById(verifiedClaims.userId);
        }

        if (privyUser) {
          const { syncUserFromPrivy } = await loadPrivySyncModule();
          user = await syncUserFromPrivy(privyUser);
          logger.info("[AUTH] ✓ JIT sync complete:", {
            userId: user.id,
            orgId: user.organization_id,
          });
        } else {
          logger.error("[AUTH] ✗ Privy returned null for user");
        }
      } catch (privyError) {
        logger.error(
          "[AUTH] ✗ Failed to fetch user from Privy:",
          privyError instanceof Error ? privyError.message : privyError,
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
      void trackSessionActivity(user.id, user.organization_id, authToken.value);
      void ensureUserHasApiKey(user.id, user.organization_id);
    } else {
      logger.error("[AUTH] ✗ User missing organization_id:", user.id);
    }

    return user;
  } catch (error) {
    logger.error("[AUTH] ✗ Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) {
      logger.error(
        "[AUTH] ✗ Root cause:",
        error.cause instanceof Error ? error.cause.message : error.cause,
      );
    }
    return null;
  }
});

/**
 * Track session activity in background (non-blocking, debounced)
 * Uses Redis to debounce writes - only writes to DB every 60 seconds per session
 *
 * Note: We store a hashed version of the token for security and to handle JWT refreshes.
 * The hash is deterministic, so the same JWT will produce the same hash.
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
    // The service will hash the token internally for secure storage
    await userSessionsService.getOrCreateSession({
      user_id: userId,
      organization_id: organizationId,
      session_token: sessionToken,
    });
  } catch (error) {
    // Don't let session tracking failures affect the main request
    // Log detailed error info for debugging, including PostgreSQL error codes
    const errorDetails =
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            // PostgreSQL errors have a 'code' property (e.g., '23503' for FK violation)
            code: (error as Error & { code?: string }).code,
            // Additional context from Drizzle/PostgreSQL
            detail: (error as Error & { detail?: string }).detail,
            constraint: (error as Error & { constraint?: string }).constraint,
            cause: error.cause,
          }
        : error;
    logger.warn("[AUTH] Session tracking failed:", errorDetails);
  }
}

/**
 * Require authentication - throws error if not authenticated
 * Note: This allows anonymous users. Use requireAuthWithOrg for paid features.
 */
export async function requireAuth(): Promise<UserWithOrganization> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError("Authentication required");
  }

  if (!user.is_active) {
    throw new ForbiddenError("User account is inactive");
  }

  return user;
}

/**
 * Require authenticated user WITH organization (excludes anonymous users).
 *
 * Cookie session only — does not read `request` headers, so keys sent as `X-API-Key` or `Authorization: Bearer` are not accepted.
 * Use when the operation must stay human-session-shaped: signup-code redeem (anti-scripting), Stripe
 * checkout, invite accept, mixed routes where one method stays session-only, etc.
 *
 * For programmatic access (CLI, CI, integrations), prefer `requireAuthOrApiKeyWithOrg(request)` on that
 * route instead. See docs/auth-api-consistency.md for why both patterns exist.
 */
export async function requireAuthWithOrg(): Promise<
  UserWithOrganization & { organization_id: string; organization: Organization }
> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError("Authentication required");
  }

  if (!user.is_active) {
    throw new ForbiddenError("User account is inactive");
  }

  if (!user.organization_id) {
    throw new ForbiddenError("This feature requires a full account. Please sign up to continue.");
  }

  if (!user.organization || !user.organization?.is_active) {
    throw new ForbiddenError("Organization is inactive");
  }

  return user as UserWithOrganization & {
    organization_id: string;
    organization: Organization;
  };
}

/** Same as {@link requireAuthWithOrg} — explicit name for “session + org only” handlers. */
export const requireSessionAuthWithOrg = requireAuthWithOrg;

/**
 * Require user to belong to a specific organization
 */
export async function requireOrganization(organizationId: string): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (user.organization_id !== organizationId) {
    throw new ForbiddenError(`User does not have access to organization ${organizationId}`);
  }

  if (!user.organization?.is_active) {
    throw new ForbiddenError("Organization is inactive");
  }

  return user;
}

/**
 * Require user to have a specific role
 */
export async function requireRole(allowedRoles: string[]): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `User role ${user.role} is not in allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  return user;
}

/**
 * Validate an API key and return the associated user with full org checks.
 * Shared helper to avoid duplicated validation in X-API-Key and Bearer flows.
 */
async function validateAndGetApiKeyUser(apiKey: ApiKey): Promise<{ user: UserWithOrganization }> {
  if (!apiKey.is_active) {
    throw new ForbiddenError("API key is inactive");
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    throw new AuthenticationError("API key has expired");
  }

  const user = await usersService.getWithOrganization(apiKey.user_id);

  if (!user) {
    throw new AuthenticationError("User associated with API key not found");
  }

  if (!user.is_active) {
    throw new ForbiddenError("User account is inactive");
  }

  if (!user.organization?.is_active) {
    throw new ForbiddenError("Organization is inactive");
  }

  return { user };
}

/**
 * Check if a token looks like a JWT (has three base64 parts separated by dots)
 */
function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Resolve the current user from wallet headers, API key, Bearer (JWT or key), or Privy cookie — in that
 * precedence order when wallet headers are fully present (fail-closed; no fallback — why: avoid bypass
 * by mixing stale wallet headers with a valid key).
 *
 * Allows anonymous users when the resolved user has no org requirement. For org-scoped billing or
 * resources, use `requireAuthOrApiKeyWithOrg`.
 */
export async function requireAuthOrApiKey(request: NextRequest): Promise<AuthResult> {
  // Try wallet signature authentication first (if headers present)
  const hasWalletHeaders =
    request.headers.get("X-Wallet-Address") &&
    request.headers.get("X-Wallet-Signature") &&
    request.headers.get("X-Timestamp");

  // Note: When wallet headers are present, we fail closed — API key/session fallback is intentionally skipped
  // to prevent clients from bypassing wallet auth by sending stale wallet headers alongside valid API keys
  if (hasWalletHeaders) {
    try {
      // verifyWalletSignature returns UserWithOrganization or throws when headers are present
      const walletUser = await verifyWalletSignature(request);
      if (!walletUser) {
        throw new AuthenticationError("Wallet authentication failed");
      }
      return {
        user: walletUser,
        authMethod: "wallet_signature",
      };
    } catch (e) {
      // Always fail closed when wallet headers are present
      logger.error("[AUTH] Wallet auth failed with headers present - failing closed:", e);
      // Preserve service errors but clean auth errors for security
      if (e instanceof Error && e.message.includes("Service temporarily")) {
        throw e; // Propagate service outage errors
      }
      // Return 401 and do not fall through to other auth methods
      throw new AuthenticationError("Invalid wallet signature");
    }
  }

  // Check for API key in X-API-Key header
  const apiKeyHeader = request.headers.get("X-API-Key");
  const authHeader = request.headers.get("authorization");

  if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
    const apiKey = await apiKeysService.validateApiKey(apiKeyHeader);

    if (!apiKey) {
      throw new AuthenticationError("Invalid or expired API key");
    }

    const { user } = await validateAndGetApiKeyUser(apiKey);
    await apiKeysService.incrementUsage(apiKey.id);
    return { user, apiKey, authMethod: "api_key" };
  }

  // Check Authorization: Bearer header
  if (authHeader?.startsWith("Bearer ")) {
    const bearerValue = authHeader.substring(7).trim();

    if (bearerValue.length === 0) {
      throw new AuthenticationError("Invalid authorization header");
    }

    // If the bearer token looks like a JWT, try to validate it as a Privy token first,
    // then fall back to Steward JWT verification
    if (looksLikeJwt(bearerValue)) {
      // 1. Try Privy token verification
      const verifiedClaims = await verifyAuthTokenCached(bearerValue);

      if (verifiedClaims) {
        // Get user from Privy ID
        const user = await usersService.getByPrivyId(verifiedClaims.userId);

        if (!user) {
          throw new AuthenticationError("User not found");
        }

        if (!user.is_active) {
          throw new ForbiddenError("User account is inactive");
        }

        if (!user.organization?.is_active) {
          throw new ForbiddenError("Organization is inactive");
        }

        return {
          user,
          authMethod: "session",
          session_token: bearerValue,
        };
      }

      // 2. Try Steward JWT verification
      const stewardClaims = await verifyStewardTokenCached(bearerValue);

      if (stewardClaims) {
        // Look up user by Steward ID
        const user = await usersService.getByStewardId(stewardClaims.userId);

        if (user) {
          if (!user.is_active) {
            throw new ForbiddenError("User account is inactive");
          }

          if (!user.organization?.is_active) {
            throw new ForbiddenError("Organization is inactive");
          }

          return {
            user,
            authMethod: "session",
            session_token: bearerValue,
          };
        }

        // TODO: JIT sync from Steward (mirrors Privy JIT sync above)
        // Once syncUserFromSteward is implemented, uncomment:
        // const syncedUser = await syncUserFromSteward(stewardClaims);
        // if (syncedUser) {
        //   return { user: syncedUser, authMethod: "session", session_token: bearerValue };
        // }

        logger.warn("[AUTH] Steward JWT valid but no matching user", {
          stewardUserId: stewardClaims.userId.substring(0, 20),
        });
        throw new AuthenticationError("User not found");
      }
    }

    // Try as API key (fallback for non-JWT tokens or if JWT validation failed)
    const apiKey = await apiKeysService.validateApiKey(bearerValue);

    if (apiKey) {
      const { user } = await validateAndGetApiKeyUser(apiKey);
      await apiKeysService.incrementUsage(apiKey.id);

      return {
        user,
        apiKey,
        authMethod: "api_key",
      };
    }

    // If it looked like a JWT but failed verification, give a helpful error
    if (looksLikeJwt(bearerValue)) {
      throw new AuthenticationError("Invalid or expired token");
    }

    throw new AuthenticationError("Invalid or expired API key");
  }

  // Fall back to session authentication (cookie-based)
  const user = await requireAuth();

  // Get session token from cookies
  const cookieStore = await cookies();
  const authToken = cookieStore.get("privy-token");

  return {
    user,
    authMethod: "session",
    session_token: authToken?.value,
  };
}

/**
 * Same as `requireAuthOrApiKey` but requires an active organization on the resolved user.
 *
 * Why: Credits, deployments, voice pipelines, and org admin APIs must not run for org-less accounts;
 * throws `ForbiddenError` with a signup-oriented message instead of ambiguous 401s.
 *
 * Use on routes that should work from the dashboard (cookies) and from servers (API keys). If the
 * route must reject keys entirely, use `requireAuthWithOrg()` and list the path under session-only
 * rules in `proxy.ts` where appropriate.
 */
export async function requireAuthOrApiKeyWithOrg(request: NextRequest): Promise<
  AuthResult & {
    user: UserWithOrganization & {
      organization_id: string;
      organization: Organization;
    };
  }
> {
  // Dev-only bypass: allow X-Api-Key: dev-test-key to skip real auth
  if (
    process.env.NODE_ENV === "development" &&
    request.headers.get("X-Api-Key") === "dev-test-key"
  ) {
    const devUser = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "dev@localhost",
      organization_id: "00000000-0000-0000-0000-000000000001",
      organization: { id: "00000000-0000-0000-0000-000000000001", name: "Dev Org" } as Organization,
    } as UserWithOrganization & { organization_id: string; organization: Organization };
    return { user: devUser, authMethod: "api_key" as const } as AuthResult & {
      user: typeof devUser;
    };
  }

  const result = await requireAuthOrApiKey(request);

  if (!result.user.organization_id || !result.user.organization) {
    throw new ForbiddenError("This feature requires a full account. Please sign up to continue.");
  }

  return result as AuthResult & {
    user: UserWithOrganization & {
      organization_id: string;
      organization: Organization;
    };
  };
}

/**
 * Verify a Privy auth token directly (for API routes)
 * Uses cached verification to avoid repeated Privy API calls
 */
export async function verifyPrivyToken(token: string) {
  return verifyAuthTokenCached(token);
}

/**
 * Get user from request headers (for API routes)
 */
export async function getUserFromRequest(
  request: NextRequest,
): Promise<UserWithOrganization | null> {
  // Check Authorization header for Privy token
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const privyUser = await verifyPrivyToken(token);

    if (privyUser) {
      // Get user from database
      const user = await usersService.getByPrivyId(privyUser.userId);

      // The email is not directly available from the token claims
      // User should already be synced via webhooks

      return user ?? null;
    }
  }

  // Check cookies
  return getCurrentUser();
}

// Admin authentication - requires wallet connection and admin role

export interface AdminAuthResult {
  user: UserWithOrganization;
  isAdmin: boolean;
  role: string | null;
}

export async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.wallet_address) {
    throw new AuthenticationError("Wallet connection required for admin access");
  }

  const isAdmin = await adminService.isAdmin(user.wallet_address);
  if (!isAdmin) {
    throw new ForbiddenError("Admin access required");
  }

  const role = await adminService.getAdminRole(user.wallet_address);

  return { user, isAdmin: true, role };
}

// Re-export Privy client utilities for advanced use cases
export {
  getPrivyClient,
  invalidateAllPrivyTokenCaches,
  invalidatePrivyTokenCache,
  verifyAuthTokenCached,
} from "./auth/privy-client";

export {
  invalidateStewardTokenCache,
  verifyStewardTokenCached,
} from "./auth/steward-client";
