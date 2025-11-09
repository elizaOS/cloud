import { PrivyClient } from "@privy-io/server-auth";
import {
  usersService,
  apiKeysService,
  userSessionsService,
} from "@/lib/services";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import type { Organization } from "@/db/schemas/organizations";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// Re-export Organization type for convenience
export type { Organization };

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

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
    console.warn("[Auth] Invalid userId, skipping API key check");
    return;
  }

  if (!organizationId || organizationId.trim() === "") {
    console.warn(
      `[Auth] No organization for user ${userId}, skipping API key check`,
    );
    return;
  }

  try {
    // Check if user already has an API key
    const existingKeys = await apiKeysService.listByOrganization(
      organizationId,
    );
    const userHasKey = existingKeys.some((key) => key.user_id === userId);

    if (userHasKey) {
      return; // User already has a key
    }

    // Create default API key for existing user
    console.log(`[Auth] Creating API key for existing user ${userId}`);
    await apiKeysService.create({
      user_id: userId,
      organization_id: organizationId,
      name: "Default API Key",
      is_active: true,
    });

    console.log(`[Auth] Created default API key for existing user ${userId}`);
  } catch (error) {
    console.error(`[Auth] Error ensuring API key for user ${userId}:`, error);
    throw error;
  }
}

export type AuthResult = {
  user: UserWithOrganization;
  apiKey?: ApiKey;
  authMethod: "session" | "api_key";
  session_token?: string;
};

/**
 * Get the current authenticated user from Privy token
 *
 * Flow:
 * 1. Verify Privy token from cookies
 * 2. Look up user in database by Privy ID
 * 3. If not found, fetch full user data from Privy API (just-in-time sync)
 * 4. Create user and organization in database
 * 5. Create or get user session for tracking
 *
 * This handles the race condition where webhooks haven't fired yet.
 */
export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    try {
      // Get the auth token from cookies
      const cookieStore = await cookies();
      const authToken = cookieStore.get("privy-token");

      if (!authToken) {
        return null;
      }

      // Verify the token with Privy
      const verifiedClaims = await privyClient.verifyAuthToken(authToken.value);

      if (!verifiedClaims) {
        return null;
      }

      console.log("[Auth] Privy token verified:", {
        userId: verifiedClaims.userId,
        issuedAt: verifiedClaims.issuedAt,
      });

      // Get user from database by Privy ID
      let user = await usersService.getByPrivyId(verifiedClaims.userId);

      // Just-in-time sync: If user doesn't exist, fetch from Privy and create
      // This handles race conditions where webhooks haven't fired yet
      if (!user) {
        console.log(
          `User ${verifiedClaims.userId} not in database, performing just-in-time sync...`,
        );

        try {
          // Fetch full user data from Privy API
          const privyUser = await privyClient.getUser(verifiedClaims.userId);

          console.log("[Auth] Fetched user from Privy API:", {
            userId: privyUser?.id,
            hasEmail: !!privyUser?.email,
            hasLinkedAccounts: !!privyUser?.linkedAccounts,
            linkedAccountsCount: privyUser?.linkedAccounts?.length || 0,
          });

          if (privyUser) {
            // Import the sync logic from webhook
            const { syncUserFromPrivy } = await import("./privy-sync");
            // Type cast needed because Privy SDK types don't match our simplified interface
            user = await syncUserFromPrivy(
              privyUser as unknown as {
                id: string;
                email?: { address: string };
                name?: string | null;
                linkedAccounts?: Array<Record<string, unknown>>;
              },
            );
            console.log(
              `Successfully synced user ${verifiedClaims.userId} just-in-time`,
            );
          }
        } catch (syncError) {
          console.error("Failed to sync user just-in-time:", syncError);
          // User authentication is valid but we couldn't create them locally
          // This is a critical error - webhooks might be broken
          return null;
        }
      }

      // Create or get user session for authenticated users with organizations
      if (user && user.organization_id) {
        try {
          await userSessionsService.getOrCreateSession({
            user_id: user.id,
            organization_id: user.organization_id,
            session_token: authToken.value,
          });
        } catch (sessionError) {
          console.error("Failed to create/get user session:", sessionError);
        }

        // Ensure user has an API key for agent runtime (fire-and-forget)
        // This handles existing users who registered before API key auto-generation
        ensureUserHasApiKey(user.id, user.organization_id).catch((error) => {
          console.error("[Auth] Failed to ensure user has API key:", error);
        });
      }

      return user ?? null;
    } catch (error) {
      console.error("Error verifying Privy token:", error);
      return null;
    }
  },
);

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

  if (!user.organization_id!) {
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
 * Supports both X-API-Key header and Authorization: Bearer header
 * Note: This allows anonymous users. Use requireAuthOrApiKeyWithOrg for paid features.
 */
export async function requireAuthOrApiKey(
  request: NextRequest,
): Promise<AuthResult> {
  // DEBUG: Log request details with ALL headers for debugging
  const allHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Redact sensitive values but show they exist
    if (key.toLowerCase() === "authorization" || key.toLowerCase() === "x-api-key") {
      allHeaders[key] = value.substring(0, 20) + "...";
    } else {
      allHeaders[key] = value;
    }
  });

  console.log("[Auth] ==================== AUTH REQUEST ====================");
  console.log("[Auth] URL:", request.url);
  console.log("[Auth] Method:", request.method);
  console.log("[Auth] All Headers:", allHeaders);
  console.log("[Auth] Has X-API-Key:", !!request.headers.get("X-API-Key"));
  console.log("[Auth] Has Authorization:", !!request.headers.get("authorization"));
  console.log("[Auth] Has Cookie:", !!request.headers.get("cookie"));

  // Check for API key in X-API-Key header (legacy)
  const apiKeyHeader = request.headers.get("X-API-Key");

  // Check for API key in Authorization header (standard)
  const authHeader = request.headers.get("authorization");
  let apiKeyValue: string | null = null;

  if (apiKeyHeader) {
    console.log("[Auth] Found API key in X-API-Key header");
    apiKeyValue = apiKeyHeader;
  } else if (authHeader?.startsWith("Bearer ")) {
    console.log("[Auth] Found API key in Authorization Bearer header");
    apiKeyValue = authHeader.substring(7);
  } else if (authHeader) {
    console.log("[Auth] Authorization header exists but doesn't start with 'Bearer ':", authHeader.substring(0, 20));
  }

  if (apiKeyValue) {
    console.log("[Auth] Extracted API key:", apiKeyValue.substring(0, 12) + "...");
    console.log("[Auth] API key length:", apiKeyValue.length);
    console.log("[Auth] API key trimmed length:", apiKeyValue.trim().length);

    if (!apiKeyValue || apiKeyValue.trim().length === 0) {
      console.error("[Auth] ❌ API key is empty after trimming");
      throw new Error("Invalid API key format");
    }

    console.log("[Auth] Validating API key in database...");

    const apiKey = await apiKeysService.validateApiKey(apiKeyValue);

    if (!apiKey) {
      console.error("[Auth] ❌ API KEY VALIDATION FAILED");
      console.error(`[Auth] Key: ${apiKeyValue.substring(0, 12)}...`);
      console.error("[Auth] Key not found in database");
      console.error("[Auth] This is the UNAUTHORIZED error source!");
      throw new Error("Invalid or expired API key");
    }

    console.log("[Auth] ✅ API key validated successfully");
    console.log("[Auth] API Key ID:", apiKey.id);
    console.log("[Auth] User ID:", apiKey.user_id);
    console.log("[Auth] Organization ID:", apiKey.organization_id);

    if (!apiKey.is_active) {
      console.error("[Auth] ❌ API key is inactive");
      throw new Error("API key is inactive");
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      console.error("[Auth] ❌ API key has expired");
      throw new Error("API key has expired");
    }

    console.log("[Auth] Getting user from API key...");
    const user = await getUserFromApiKey(apiKey);

    if (!user) {
      console.error("[Auth] ❌ User associated with API key not found");
      throw new Error("User associated with API key not found");
    }

    console.log("[Auth] User found:", user.id);

    if (!user.is_active) {
      console.error("[Auth] ❌ User account is inactive");
      throw new Error("User account is inactive");
    }

    if (!user.organization?.is_active) {
      console.error("[Auth] ❌ Organization is inactive");
      throw new Error("Organization is inactive");
    }

    console.log("[Auth] Incrementing API key usage...");
    await apiKeysService.incrementUsage(apiKey.id);

    console.log("[Auth] ✅ Authentication successful via API key");
    console.log("[Auth] ========================================================");

    return {
      user,
      apiKey,
      authMethod: "api_key",
    };
  }

  // Fall back to session authentication
  console.log("[Auth] No API key found, falling back to session authentication");
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
 * Verify a Privy auth token directly (for API routes)
 */
export async function verifyPrivyToken(token: string) {
  try {
    const user = await privyClient.verifyAuthToken(token);
    return user;
  } catch (error) {
    console.error("Error verifying Privy token:", error);
    return null;
  }
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
