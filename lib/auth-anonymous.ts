/**
 * Anonymous User Authentication
 *
 * Handles authentication and session management for free/anonymous users.
 * Anonymous users can access limited features without signing up.
 *
 * Flow:
 * 1. User visits /dashboard/eliza without auth
 * 2. System creates anonymous user + session
 * 3. Session cookie tracks the user (7 day expiry)
 * 4. User gets 10 free messages (tracked per session, NOT via credits)
 * 5. After limit, prompted to sign up
 * 6. On signup, anonymous data transfers to real account
 */

import { nanoid } from "nanoid";
import { cookies, headers } from "next/headers";
import { usersService, anonymousSessionsService } from "@/lib/services";
import { db } from "@/db/client";
import {
  users,
  conversations,
  anonymousSessions,
  organizations,
} from "@/db/schemas";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization } from "@/lib/types";

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

  logger.info("auth-anonymous", "Created new anonymous session", {
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
 * Called during Privy webhook when user signs up.
 * Transfers all chat history and data to the new real account.
 *
 * @param anonymousUserId - ID of anonymous user to convert
 * @param privyUserId - Privy user ID of new authenticated user
 */
export async function convertAnonymousToReal(
  anonymousUserId: string,
  privyUserId: string,
): Promise<void> {
  logger.info("auth-anonymous", "Starting anonymous to real user conversion", {
    anonymousUserId,
    privyUserId,
  });

  await db.transaction(async (tx) => {
    // 1. Get the anonymous user
    const [anonUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, anonymousUserId), eq(users.is_anonymous, true)))
      .limit(1);

    if (!anonUser) {
      throw new Error("Anonymous user not found");
    }

    // 2. Check if real user already exists (created by Privy webhook)
    const [realUser] = await tx
      .select()
      .from(users)
      .where(eq(users.privy_user_id, privyUserId))
      .limit(1);

    if (!realUser) {
      // Real user doesn't exist yet - create organization and convert in-place

      // Generate unique organization slug
      const orgSlug = `user-${privyUserId.slice(-8)}-${Math.random().toString(36).slice(2, 8)}`;

      // Create organization for the user
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: `${anonUser.name || "User"}'s Organization`,
          slug: orgSlug,
          credit_balance: "5.00", // $5 initial credits
        })
        .returning();

      logger.info("auth-anonymous", "Created organization for converted user", {
        organizationId: organization.id,
        userId: anonymousUserId,
        creditBalance: organization.credit_balance,
      });

      // Update anonymous user to become real user with organization
      await tx
        .update(users)
        .set({
          privy_user_id: privyUserId,
          is_anonymous: false,
          anonymous_session_id: null,
          expires_at: null,
          organization_id: organization.id,
          role: "owner",
          updated_at: new Date(),
        })
        .where(eq(users.id, anonymousUserId));

      logger.info(
        "auth-anonymous",
        "Converted anonymous user to real user (in-place)",
        {
          userId: anonymousUserId,
          privyUserId,
          organizationId: organization.id,
        },
      );
    } else {
      // Real user exists - transfer data from anonymous to real user

      // Transfer conversations
      const conversationResult = await tx
        .update(conversations)
        .set({
          user_id: realUser.id,
          organization_id: realUser.organization_id,
          updated_at: new Date(),
        })
        .where(eq(conversations.user_id, anonymousUserId))
        .returning();

      logger.info(
        "auth-anonymous",
        "Transferred conversations from anonymous to real user",
        {
          anonymousUserId,
          realUserId: realUser.id,
          conversationCount: conversationResult.length,
        },
      );

      // Delete anonymous user (cascade will clean up sessions)
      await tx.delete(users).where(eq(users.id, anonymousUserId));

      logger.info(
        "auth-anonymous",
        "Deleted anonymous user after data transfer",
        {
          anonymousUserId,
        },
      );
    }

    // 3. Mark session as converted (use transaction context)
    const [session] = await tx
      .select()
      .from(anonymousSessions)
      .where(eq(anonymousSessions.user_id, anonymousUserId))
      .limit(1);

    if (session) {
      await tx
        .update(anonymousSessions)
        .set({
          converted_at: new Date(),
          is_active: false,
        })
        .where(eq(anonymousSessions.id, session.id));

      logger.info("auth-anonymous", "Marked session as converted", {
        sessionId: session.id,
      });
    }
  });

  // 4. Clear anonymous cookie
  const cookieStore = await cookies();
  cookieStore.delete(ANON_SESSION_COOKIE);

  logger.info("auth-anonymous", "Successfully converted anonymous user", {
    anonymousUserId,
    privyUserId,
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

  if (!sessionToken) {
    return null;
  }

  const session = await anonymousSessionsService.getByToken(sessionToken);

  if (!session) {
    return null;
  }

  const user = await usersService.getById(session.user_id);

  if (!user || !user.is_anonymous) {
    return null;
  }

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
