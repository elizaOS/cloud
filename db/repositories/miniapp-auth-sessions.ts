/**
 * Miniapp Auth Sessions Repository
 *
 * Database operations for miniapp authentication sessions.
 * Manages authentication sessions for the miniapp pass-through auth flow.
 * Similar to CLI auth sessions but for web-based miniapps that can't use Privy directly.
 */

import { eq, and, gt, lt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  miniappAuthSessions,
  type MiniappAuthSession,
  type NewMiniappAuthSession,
} from "@/db/schemas/miniapp-auth-sessions";

/**
 * Repository for miniapp authentication session database operations.
 */
class MiniappAuthSessionsRepository {
  /**
   * Creates a new miniapp auth session.
   */
  async create(data: NewMiniappAuthSession): Promise<MiniappAuthSession> {
    const [session] = await db
      .insert(miniappAuthSessions)
      .values(data)
      .returning();
    return session;
  }

  /**
   * Gets a session by session ID.
   */
  async getBySessionId(sessionId: string): Promise<MiniappAuthSession | null> {
    const [session] = await db
      .select()
      .from(miniappAuthSessions)
      .where(eq(miniappAuthSessions.session_id, sessionId))
      .limit(1);
    return session || null;
  }

  /**
   * Gets an active (non-expired, pending) session by session ID.
   */
  async getActiveSession(
    sessionId: string
  ): Promise<MiniappAuthSession | null> {
    const [session] = await db
      .select()
      .from(miniappAuthSessions)
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          gt(miniappAuthSessions.expires_at, new Date())
        )
      )
      .limit(1);
    return session || null;
  }

  /**
   * Marks a session as authenticated and stores user/org/auth token information.
   *
   * Only updates sessions with status "pending".
   * Updates expires_at to TOKEN_EXPIRY_DAYS from now (token valid for 30 days).
   */
  async markAuthenticated(
    sessionId: string,
    userId: string,
    organizationId: string,
    authToken: string,
    authTokenHash: string,
    tokenExpiresAt: Date
  ): Promise<MiniappAuthSession | null> {
    // Validate expiry date - maximum 30 days from now
    const MAX_TOKEN_EXPIRY_DAYS = 30;
    const maxExpiry = new Date(
      Date.now() + MAX_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // If provided expiry is beyond max, cap it
    const validatedExpiry =
      tokenExpiresAt > maxExpiry ? maxExpiry : tokenExpiresAt;

    // Also ensure expiry is not in the past
    const now = new Date();
    if (validatedExpiry < now) {
      throw new Error("Token expiry date cannot be in the past");
    }

    const [session] = await db
      .update(miniappAuthSessions)
      .set({
        status: "authenticated",
        user_id: userId,
        organization_id: organizationId,
        auth_token: authToken,
        auth_token_hash: authTokenHash,
        authenticated_at: new Date(),
        expires_at: validatedExpiry,
      })
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          eq(miniappAuthSessions.status, "pending")
        )
      )
      .returning();
    return session || null;
  }

  /**
   * Gets and clears auth token (one-time retrieval for security).
   *
   * Marks session as "used" after retrieval. Only works for authenticated sessions.
   *
   * @returns Auth token, user ID, and organization ID, or null if not found.
   */
  async getAndClearAuthToken(sessionId: string): Promise<{
    authToken: string;
    userId: string;
    organizationId: string;
  } | null> {
    // First, get the session with the token (before we clear it)
    const [existingSession] = await db
      .select({
        auth_token: miniappAuthSessions.auth_token,
        user_id: miniappAuthSessions.user_id,
        organization_id: miniappAuthSessions.organization_id,
        status: miniappAuthSessions.status,
      })
      .from(miniappAuthSessions)
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          eq(miniappAuthSessions.status, "authenticated"),
          sql`${miniappAuthSessions.auth_token} IS NOT NULL`
        )
      )
      .limit(1);

    if (
      !existingSession ||
      !existingSession.auth_token ||
      !existingSession.user_id ||
      !existingSession.organization_id
    ) {
      return null;
    }

    // Atomic update to prevent TOCTOU race condition
    // This ensures only one request can retrieve the token, even with concurrent calls
    const result = await db
      .update(miniappAuthSessions)
      .set({
        auth_token: null,
        status: "used",
        used_at: new Date(),
      })
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          eq(miniappAuthSessions.status, "authenticated"),
          // Only update if auth_token is not null (prevents double-use)
          sql`${miniappAuthSessions.auth_token} IS NOT NULL`
        )
      );

    // If no rows were updated, another request got there first
    if (result.rowCount === 0) {
      return null;
    }

    return {
      authToken: existingSession.auth_token,
      userId: existingSession.user_id,
      organizationId: existingSession.organization_id,
    };
  }

  /**
   * Verifies an auth token against stored hash.
   *
   * Only verifies non-expired sessions.
   *
   * @returns User ID and organization ID if token is valid, null otherwise.
   */
  async verifyAuthToken(
    authTokenHash: string
  ): Promise<{ userId: string; organizationId: string } | null> {
    const [session] = await db
      .select()
      .from(miniappAuthSessions)
      .where(
        and(
          eq(miniappAuthSessions.auth_token_hash, authTokenHash),
          gt(miniappAuthSessions.expires_at, new Date())
        )
      )
      .limit(1);

    if (!session || !session.user_id || !session.organization_id) {
      return null;
    }

    return {
      userId: session.user_id,
      organizationId: session.organization_id,
    };
  }

  /**
   * Deletes expired sessions that were never authenticated (cleanup).
   *
   * @returns Number of sessions deleted.
   */
  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(miniappAuthSessions)
      .where(
        and(
          lt(miniappAuthSessions.expires_at, new Date()),
          isNull(miniappAuthSessions.user_id)
        )
      );
    return result.rowCount || 0;
  }
}

/**
 * Singleton instance of MiniappAuthSessionsRepository.
 */
export const miniappAuthSessionsRepository =
  new MiniappAuthSessionsRepository();
