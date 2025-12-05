/**
 * Miniapp Authentication Middleware
 * 
 * Verifies miniapp auth tokens and attaches user context to requests.
 * This handles authentication for miniapp API requests that come with
 * an X-Miniapp-Token header.
 */

import { NextRequest, NextResponse } from "next/server";
import { miniappAuthSessionsService } from "@/lib/services/miniapp-auth-sessions";
import { usersService } from "@/lib/services";
import type { UserWithOrganization } from "@/lib/types";

type MiniappAuthResult = {
  success: true;
  user: UserWithOrganization;
} | {
  success: false;
  error: string;
  status: number;
}

/**
 * Verify miniapp token and get user
 */
export async function verifyMiniappToken(
  request: NextRequest
): Promise<MiniappAuthResult> {
  const token = request.headers.get("x-miniapp-token");

  if (!token) {
    return {
      success: false,
      error: "Missing authentication token",
      status: 401,
    };
  }

  try {
    // Verify the token
    const tokenData = await miniappAuthSessionsService.verifyToken(token);

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
    console.error("[Miniapp Auth] Token verification failed:", error);
    return {
      success: false,
      error: "Authentication failed",
      status: 500,
    };
  }
}

/**
 * Require miniapp authentication
 * Returns the user if authenticated, or throws an error response
 */
export async function requireMiniappAuth(
  request: NextRequest
): Promise<UserWithOrganization> {
  const result = await verifyMiniappToken(request);

  if (!result.success) {
    throw NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return result.user;
}

/**
 * Optional miniapp authentication
 * Returns the user if authenticated, or null if not
 */
export async function optionalMiniappAuth(
  request: NextRequest
): Promise<UserWithOrganization | null> {
  const token = request.headers.get("x-miniapp-token");
  
  if (!token) {
    return null;
  }

  const result = await verifyMiniappToken(request);
  
  if (!result.success) {
    return null;
  }

  return result.user;
}

