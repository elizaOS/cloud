import { PrivyClient } from "@privy-io/server-auth";
import {
  getUserWithOrganization,
  getUserByPrivyId,
} from "@/lib/queries/users";
import { validateApiKey, incrementApiKeyUsage } from "@/lib/queries/api-keys";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export type AuthResult = {
  user: UserWithOrganization;
  apiKey?: ApiKey;
  authMethod: "session" | "api_key";
};

/**
 * Get the current authenticated user from Privy token
 * 
 * Flow:
 * 1. Verify Privy token from cookies
 * 2. Look up user in database by Privy ID
 * 3. If not found, fetch full user data from Privy API (just-in-time sync)
 * 4. Create user and organization in database
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

      // Get user from database by Privy ID
      let user = await getUserByPrivyId(verifiedClaims.userId);
      
      // Just-in-time sync: If user doesn't exist, fetch from Privy and create
      // This handles race conditions where webhooks haven't fired yet
      if (!user) {
        console.log(`User ${verifiedClaims.userId} not in database, performing just-in-time sync...`);
        
        try {
          // Fetch full user data from Privy API
          const privyUser = await privyClient.getUser(verifiedClaims.userId);
          
          if (privyUser) {
            // Import the sync logic from webhook
            const { syncUserFromPrivy } = await import("./privy-sync");
            // Type cast needed because Privy SDK types don't match our simplified interface
            user = await syncUserFromPrivy(privyUser as unknown as { id: string; email?: { address: string }; name?: string | null; linkedAccounts?: Array<Record<string, unknown>> });
            console.log(`Successfully synced user ${verifiedClaims.userId} just-in-time`);
          }
        } catch (syncError) {
          console.error("Failed to sync user just-in-time:", syncError);
          // User authentication is valid but we couldn't create them locally
          // This is a critical error - webhooks might be broken
          return null;
        }
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

  if (!user.organization.is_active) {
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
async function getUserFromApiKey(apiKey: ApiKey): Promise<UserWithOrganization | null> {
  if (!apiKey.user_id) {
    return null;
  }

  return (await getUserWithOrganization(apiKey.user_id)) ?? null;
}

/**
 * Require authentication via session or API key
 */
export async function requireAuthOrApiKey(
  request: NextRequest,
): Promise<AuthResult> {
  // Check for API key first
  const apiKeyHeader = request.headers.get("X-API-Key");

  if (apiKeyHeader) {
    const apiKey = await validateApiKey(apiKeyHeader);

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

    if (!user.organization.is_active) {
      throw new Error("Organization is inactive");
    }

    await incrementApiKeyUsage(apiKey.id);

    return {
      user,
      apiKey,
      authMethod: "api_key",
    };
  }

  // Fall back to session authentication
  const user = await requireAuth();

  return {
    user,
    authMethod: "session",
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
  request: NextRequest
): Promise<UserWithOrganization | null> {
  // Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const privyUser = await verifyPrivyToken(token);
    
    if (privyUser) {
      // Get user from database
      const user = await getUserByPrivyId(privyUser.userId);
      
      // The email is not directly available from the token claims
      // User should already be synced via webhooks
      
      return user ?? null;
    }
  }

  // Check cookies
  return getCurrentUser();
}