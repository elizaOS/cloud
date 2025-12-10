/**
 * App Authentication Middleware
 *
 * Verifies app auth tokens and attaches user context to requests.
 * This handles authentication for app API requests that come with
 * an X-App-Token header.
 */

import { NextRequest, NextResponse } from "next/server";
import { appAuthSessionsService } from "@/lib/services/app-auth-sessions";
import { usersService } from "@/lib/services/users";
import type { UserWithOrganization } from "@/lib/types";

type AppAuthResult =
  | {
      success: true;
      user: UserWithOrganization;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

/**
 * Verify app token and get user
 */
export async function verifyAppToken(
  request: NextRequest,
): Promise<AppAuthResult> {
  const token = request.headers.get("x-app-token");

  if (!token) {
    return {
      success: false,
      error: "Missing authentication token",
      status: 401,
    };
  }

  try {
    // Verify the token
    const tokenData = await appAuthSessionsService.verifyToken(token);

    if (!tokenData) {
      return {
        success: false,
        error: "Invalid or expired token",
        status: 401,
      };
    }

    // Get the user
    const user = await usersService.getById(tokenData.userId);

    if (!user) {
      return {
        success: false,
        error: "User not found",
        status: 401,
      };
    }

    // Verify organization matches
    if (user.organization_id !== tokenData.organizationId) {
      return {
        success: false,
        error: "Organization mismatch",
        status: 403,
      };
    }

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("[App Auth] Token verification failed:", error);
    return {
      success: false,
      error: "Authentication failed",
      status: 500,
    };
  }
}

/**
 * Require app authentication
 * Returns the user if authenticated, or throws an error response
 */
export async function requireAppAuth(
  request: NextRequest,
): Promise<UserWithOrganization> {
  const result = await verifyAppToken(request);

  if (!result.success) {
    throw NextResponse.json({ error: result.error }, { status: result.status });
  }

  return result.user;
}

/**
 * Optional app authentication
 * Returns the user if authenticated, or null if not
 */
export async function optionalAppAuth(
  request: NextRequest,
): Promise<UserWithOrganization | null> {
  const token = request.headers.get("x-app-token");

  if (!token) {
    return null;
  }

  const result = await verifyAppToken(request);

  if (!result.success) {
    return null;
  }

  return result.user;
}
