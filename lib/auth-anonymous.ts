/**
 * Anonymous User Authentication
 *
 * Handles authentication and session management for free/anonymous users.
 * Anonymous users can access limited features without signing up.
 *
 * Flow:
 * 1. User visits /dashboard/chat without auth
 * 2. System creates anonymous user + session
 * 3. Session cookie tracks the user (7 day expiry)
 * 4. User gets 10 free messages (tracked per session, NOT via credits)
 * 5. After limit, prompted to sign up
 * 6. On signup, anonymous data transfers to real account
 *
 * NOTE: This module is being deprecated in favor of lib/session/unified-session.ts
 * Use getOrCreateSessionUser() from @/lib/session for new code.
 */

import { nanoid } from "nanoid";
import { cookies, headers } from "next/headers";
import { usersService, anonymousSessionsService } from "@/lib/services";
import { db } from "@/db/client";
import { users, anonymousSessions } from "@/db/schemas";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization } from "@/lib/types";
import { migrateAnonymousSession } from "@/lib/session";

// Constants
const ANON_SESSION_COOKIE = "eliza-anon-session";
const ANON_SESSION_EXPIRY_DAYS = 7;
const ANON_MESSAGE_LIMIT = 10;
const ANON_HOURLY_LIMIT = 10;

/**
 * Get client IP address from headers
 */
async function getClientIp(): Promise<string | undefined> {
  const headersList = await headers();
  return (
    headersList.get("x-forwarded-for")?.split(",")[0] ||
    headersList.get("x-real-ip") ||
    undefined
  );
}

/**
 * Get user agent from headers
 */
async function getUserAgent(): Promise<string | undefined> {
  const headersList = await headers();
  return headersList.get("user-agent") || undefined;
}

/**
 * Get or create an anonymous user session
 *
 * This function:
 * 1. Checks for existing session cookie
 * 2. Validates session is still active and not expired
 * 3. Returns existing user if valid
 * 4. Creates new anonymous user + session if needed
 * 5. Sets HTTP-only session cookie
 *
 * @returns User and session data
 */
export async function getOrCreateAnonymousUser(): Promise<{
  user: UserWithOrganization;
  session: Awaited<ReturnType<typeof anonymousSessionsService.getByToken>>;
  isNew: boolean;
  sessionToken?: string;
  expiresAt?: Date;
}> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ANON_SESSION_COOKIE)?.value;

  // Check for existing session
  if (sessionToken) {
    const session = await anonymousSessionsService.getByToken(sessionToken);

    if (session) {
      // Session exists and is valid
      const user = await usersService.getById(session.user_id);

      if (user && user.is_anonymous) {
        logger.info("auth-anonymous", "Existing anonymous session found", {
          userId: user.id,
          messageCount: session.message_count,
          remaining: session.messages_limit - session.message_count,
        });

        return {
          user: {
            ...user,
            organization: null as any, // Anonymous users don't have orgs
          },
          session,
          isNew: false,
        };
      }
    }
  }

  // Create new anonymous user
  const newSessionToken = nanoid(32);
  const expiresAt = new Date(
    Date.now() + ANON_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );
  const ipAddress = await getClientIp();
  const userAgent = await getUserAgent();

  // Check for IP abuse (too many sessions from same IP)
  // Skip abuse check in development for easier testing
  if (ipAddress && process.env.NODE_ENV === "production") {
    const isAbuse = await anonymousSessionsService.checkIpAbuse(ipAddress);
    if (isAbuse) {
      throw new Error(
        "Too many anonymous sessions from this IP address. Please sign up for continued access.",
      );
    }
  }

  // Create user record (no organization)
  const [newUser] = await db
    .insert(users)
    .values({
      is_anonymous: true,
      anonymous_session_id: newSessionToken,
      organization_id: null, // No org for anonymous users
      is_active: true,
      expires_at: expiresAt,
      role: "member",
    })
    .returning();

  // Create session record
  const newSession = await anonymousSessionsService.create({
    session_token: newSessionToken,
    user_id: newUser.id,
    expires_at: expiresAt,
    ip_address: ipAddress,
    user_agent: userAgent,
    messages_limit: ANON_MESSAGE_LIMIT,
  });

  // Set the cookie so subsequent requests are authenticated
  // This is valid because getOrCreateAnonymousUser is called from Route Handlers
  cookieStore.set(ANON_SESSION_COOKIE, newSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  logger.info("auth-anonymous", "Created new anonymous session and set cookie", {
    userId: newUser.id,
    sessionId: newSession.id,
    expiresAt,
  });

  return {
    user: {
      ...newUser,
      organization: null as any,
    },
    session: newSession,
    sessionToken: newSessionToken,
    expiresAt,
    isNew: true,
  };
}

/**
 * Convert anonymous user to real authenticated user
 *
 * @deprecated Use migrateAnonymousSession from @/lib/session instead.
 * This function is kept for backwards compatibility.
 *
 * @param anonymousUserId - ID of anonymous user to convert
 * @param privyUserId - Privy user ID of new authenticated user
 */
export async function convertAnonymousToReal(
  anonymousUserId: string,
  privyUserId: string,
): Promise<void> {
  logger.info("[auth-anonymous] convertAnonymousToReal called (deprecated)", {
    anonymousUserId,
    privyUserId,
    note: "Use migrateAnonymousSession from @/lib/session instead",
  });

  const result = await migrateAnonymousSession(anonymousUserId, privyUserId);

  if (!result.success) {
    throw new Error("Migration failed");
  }

  logger.info("[auth-anonymous] Migration completed via unified session", {
    anonymousUserId,
    privyUserId,
    ...result.mergedData,
  });
}

/**
 * Check if user has reached their free message limit
 */
export async function checkAnonymousLimit(sessionId: string): Promise<{
  allowed: boolean;
  reason?: "message_limit" | "hourly_limit";
  remaining: number;
  limit: number;
}> {
  const session = await anonymousSessionsService.getByToken(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Check total message limit
  if (session.message_count >= session.messages_limit) {
    return {
      allowed: false,
      reason: "message_limit",
      remaining: 0,
      limit: session.messages_limit,
    };
  }

  // Check hourly rate limit
  const rateLimitResult = await anonymousSessionsService.checkRateLimit(
    session.id,
  );

  if (!rateLimitResult.allowed) {
    return {
      allowed: false,
      reason: "hourly_limit",
      remaining: 0,
      limit: ANON_HOURLY_LIMIT,
    };
  }

  return {
    allowed: true,
    remaining: session.messages_limit - session.message_count,
    limit: session.messages_limit,
  };
}

/**
 * Get anonymous user from cookie (if exists)
 */
export async function getAnonymousUser(): Promise<{
  user: UserWithOrganization;
  session: Awaited<ReturnType<typeof anonymousSessionsService.getByToken>>;
} | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ANON_SESSION_COOKIE)?.value;

  logger.debug("[getAnonymousUser] Checking for anonymous session cookie:", {
    hasCookie: !!sessionToken,
    cookieName: ANON_SESSION_COOKIE,
    tokenPreview: sessionToken ? sessionToken.slice(0, 8) + "..." : "N/A",
  });

  if (!sessionToken) {
    logger.debug("[getAnonymousUser] No session cookie found");
    return null;
  }

  const session = await anonymousSessionsService.getByToken(sessionToken);

  if (!session) {
    logger.debug("[getAnonymousUser] Session not found in DB for token:", sessionToken.slice(0, 8));
    return null;
  }

  logger.debug("[getAnonymousUser] Session found:", {
    sessionId: session.id,
    userId: session.user_id,
  });

  const user = await usersService.getById(session.user_id);

  if (!user) {
    logger.debug("[getAnonymousUser] User not found for ID:", session.user_id);
    return null;
  }

  if (!user.is_anonymous) {
    logger.debug("[getAnonymousUser] User is not anonymous:", user.id);
    return null;
  }

  logger.debug("[getAnonymousUser] Anonymous user found:", user.id);

  return {
    user: {
      ...user,
      organization: null as any,
    },
    session,
  };
}

/**
 * Check if current request is from an anonymous user
 */
export async function isAnonymousUser(): Promise<boolean> {
  const anon = await getAnonymousUser();
  return anon !== null;
}
