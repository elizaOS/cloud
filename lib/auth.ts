import { withAuth } from "@workos-inc/authkit-nextjs";
import { usersService, apiKeysService } from "@/lib/services";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export const getCurrentUser = cache(
  async (): Promise<UserWithOrganization | null> => {
    const { user: workosUser } = await withAuth();

    if (!workosUser) {
      return null;
    }

    const user = await usersService.getByEmailWithOrganization(workosUser.email);

    if (!user) {
      console.error(
        `[Auth] User not found in database for email: ${workosUser.email}`
      );
      return null;
    }

    return user;
  },
);

export async function requireAuth(): Promise<UserWithOrganization> {
  const user = await getCurrentUser();

  if (!user) {
    return redirect("/login");
  }

  if (!user.is_active) {
    throw new Error("Forbidden: User account is inactive");
  }

  return user;
}

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

export async function requireRole(
  allowedRoles: string[],
): Promise<UserWithOrganization> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Forbidden: User role '${user.role}' not in allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  return user;
}

export type AuthResult = {
  user: UserWithOrganization;
  apiKey?: ApiKey;
  authMethod: "session" | "api_key";
};

export async function getUserFromApiKey(
  apiKey: ApiKey,
): Promise<UserWithOrganization | null> {
  const user = await usersService.getWithOrganization(apiKey.user_id);
  if (!user) {
    return null;
  }
  return user;
}

export async function requireAuthOrApiKey(
  request: NextRequest,
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const apiKeyValue = authHeader.substring(7);

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

    if (!user.organization.is_active) {
      throw new Error("Organization is inactive");
    }

    await apiKeysService.incrementUsage(apiKey.id);

    return {
      user,
      apiKey,
      authMethod: "api_key",
    };
  }

  const user = await requireAuth();

  return {
    user,
    authMethod: "session",
  };
}
