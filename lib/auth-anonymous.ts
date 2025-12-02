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
 * Security:
 * - httpOnly cookies prevent XSS attacks
 * - sameSite: strict prevents CSRF attacks
 * - IP-based abuse detection in production
 * - Tokens hashed for logging
 */

import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { usersService, anonymousSessionsService } from "@/lib/services";
import { db } from "@/db/client";
import {
  users,
  conversations,
  anonymousSessions,
  organizations,
  userCharacters,
  elizaRoomCharactersTable,
} from "@/db/schemas";
import { eq, and, sql, like, isNull } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization, User, Organization } from "@/lib/types";

// Constants - can be overridden via environment variables
const ANON_SESSION_COOKIE = "eliza-anon-session";
const ANON_SESSION_EXPIRY_DAYS = Number.parseInt(
  process.env.ANON_SESSION_EXPIRY_DAYS || "7",
  10
);
const ANON_MESSAGE_LIMIT = Number.parseInt(
  process.env.ANON_MESSAGE_LIMIT || "10",
  10
);
const ANON_HOURLY_LIMIT = Number.parseInt(
  process.env.ANON_HOURLY_LIMIT || "10",
  10
);

/**
 * Type for anonymous user (no organization)
 */
type AnonymousUserWithOrganization = Omit<User, "organization_id"> & {
  organization_id: null;
  organization: null;
};

/**
 * Hash a token for safe logging (prevents token exposure in logs)
 */
function hashTokenForLogging(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

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

      if (user?.is_anonymous) {
        logger.info("auth-anonymous", "Existing anonymous session found", {
          userId: user.id,
          messageCount: session.message_count,
          remaining: session.messages_limit - session.message_count,
        });

        // Create properly typed anonymous user
        const anonymousUser: AnonymousUserWithOrganization = {
          ...user,
          organization_id: null,
          organization: null,
        };

        return {
          user: anonymousUser as UserWithOrganization,
          session,
          isNew: false,
        };
      }
    }
  }

  // Create new anonymous user
  const newSessionToken = nanoid(32);
  const expiresAt = new Date(
    Date.now() + ANON_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
  const ipAddress = await getClientIp();
  const userAgent = await getUserAgent();

  // Check for IP abuse (too many sessions from same IP)
  // Skip abuse check in development for easier testing
  if (process.env.NODE_ENV === "production") {
    if (!ipAddress) {
      // Log when IP is missing in production - could indicate proxy misconfiguration
      logger.warn(
        "auth-anonymous",
        "Missing IP address in production - abuse detection bypassed"
      );
    } else {
      const isAbuse = await anonymousSessionsService.checkIpAbuse(ipAddress);
      if (isAbuse) {
        // Use specific error type for proper HTTP status code handling
        const error = new Error(
          "Too many anonymous sessions from this IP address. Please sign up for continued access."
        );
        error.name = "RateLimitError";
        throw error;
      }
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
    sameSite: "strict", // Prevent CSRF attacks
    path: "/",
    expires: expiresAt,
  });

  logger.info(
    "auth-anonymous",
    "Created new anonymous session and set cookie",
    {
      userId: newUser.id,
      sessionId: newSession.id,
      expiresAt,
    }
  );

  // Create properly typed anonymous user
  const anonymousUser: AnonymousUserWithOrganization = {
    ...newUser,
    organization_id: null,
    organization: null,
  };

  return {
    user: anonymousUser as UserWithOrganization,
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
  privyUserId: string
): Promise<void> {
  logger.info("auth-anonymous", "Starting anonymous to real user conversion", {
    anonymousUserId,
    privyUserId,
  });

  await db.transaction(async (tx) => {
    // 1. Get the anonymous user - try with is_anonymous flag first
    let [anonUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, anonymousUserId), eq(users.is_anonymous, true)))
      .limit(1);

    // Fallback: Also check for affiliate users that might not have is_anonymous flag set correctly
    // These have placeholder emails like "affiliate-xxx@anonymous.elizacloud.ai"
    if (!anonUser) {
      [anonUser] = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, anonymousUserId),
            like(users.email, 'affiliate-%@anonymous.elizacloud.ai'),
            isNull(users.privy_user_id)
          )
        )
        .limit(1);

      if (anonUser) {
        logger.info(
          "auth-anonymous",
          "Found affiliate user without is_anonymous flag",
          {
            userId: anonUser.id,
            email: anonUser.email,
          }
        );
      }
    }

    if (!anonUser) {
      throw new Error("Anonymous user not found");
    }

    // 2. Check if real user already exists (created by Privy webhook)
    const [realUser] = await tx
      .select()
      .from(users)
      .where(eq(users.privy_user_id, privyUserId))
      .limit(1);

    let targetUserId: string;
    let targetOrgId: string | null;

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

      targetUserId = anonymousUserId;
      targetOrgId = organization.id;

      logger.info(
        "auth-anonymous",
        "Converted anonymous user to real user (in-place)",
        {
          userId: anonymousUserId,
          privyUserId,
          organizationId: organization.id,
        }
      );

      // Update user_characters to point to the new organization (user_id stays the same)
      const charResult = await tx
        .update(userCharacters)
        .set({
          organization_id: organization.id,
          updated_at: new Date(),
        })
        .where(eq(userCharacters.user_id, anonymousUserId))
        .returning({ id: userCharacters.id, name: userCharacters.name });

      if (charResult.length > 0) {
        logger.info(
          "auth-anonymous",
          "Updated characters with new organization",
          {
            userId: anonymousUserId,
            organizationId: organization.id,
            characterCount: charResult.length,
            characters: charResult.map((c) => ({ id: c.id, name: c.name })),
          }
        );
      }
    } else {
      // Real user exists - transfer data from anonymous to real user
      targetUserId = realUser.id;
      targetOrgId = realUser.organization_id;

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
        }
      );

      // Transfer user_characters ownership
      const charResult = await tx
        .update(userCharacters)
        .set({
          user_id: realUser.id,
          organization_id: realUser.organization_id,
          updated_at: new Date(),
        })
        .where(eq(userCharacters.user_id, anonymousUserId))
        .returning({ id: userCharacters.id, name: userCharacters.name });

      if (charResult.length > 0) {
        logger.info("auth-anonymous", "Transferred characters to real user", {
          anonymousUserId,
          realUserId: realUser.id,
          characterCount: charResult.length,
          characters: charResult.map((c) => ({ id: c.id, name: c.name })),
        });
      }

      // Transfer eliza_room_characters mappings
      const roomCharResult = await tx
        .update(elizaRoomCharactersTable)
        .set({
          user_id: realUser.id,
          updated_at: new Date(),
        })
        .where(eq(elizaRoomCharactersTable.user_id, anonymousUserId))
        .returning({ room_id: elizaRoomCharactersTable.room_id });

      if (roomCharResult.length > 0) {
        logger.info(
          "auth-anonymous",
          "Transferred room-character mappings to real user",
          {
            anonymousUserId,
            realUserId: realUser.id,
            mappingCount: roomCharResult.length,
          }
        );
      }

      // Transfer participants (update entityId to point to real user)
      // Note: entityId in participants is typically a stringToUuid of the entityId string
      // We need to update any participants that reference the anonymous user's entity
      await tx.execute(sql`
        UPDATE participants 
        SET "entityId" = ${realUser.id}::uuid
        WHERE "entityId" = ${anonymousUserId}::uuid
      `);

      logger.info("auth-anonymous", "Updated participant entityIds", {
        anonymousUserId,
        realUserId: realUser.id,
      });

      // Delete anonymous user (cascade will clean up sessions)
      await tx.delete(users).where(eq(users.id, anonymousUserId));

      logger.info(
        "auth-anonymous",
        "Deleted anonymous user after data transfer",
        {
          anonymousUserId,
        }
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

  // 4. Clear anonymous cookie (only works when called from a request context)
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ANON_SESSION_COOKIE);
  } catch {
    // Cookie deletion may fail if not in request context (e.g., webhook)
    logger.debug(
      "auth-anonymous",
      "Could not delete cookie (likely not in request context)"
    );
  }

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
    session.id
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
    tokenHash: sessionToken ? hashTokenForLogging(sessionToken) : "N/A",
  });

  if (!sessionToken) {
    logger.debug("[getAnonymousUser] No session cookie found");
    return null;
  }

  const session = await anonymousSessionsService.getByToken(sessionToken);

  if (!session) {
    logger.debug(
      "[getAnonymousUser] Session not found in DB for token hash:",
      hashTokenForLogging(sessionToken)
    );
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

  // Create properly typed anonymous user
  const anonymousUser: AnonymousUserWithOrganization = {
    ...user,
    organization_id: null,
    organization: null,
  };

  return {
    user: anonymousUser as UserWithOrganization,
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
