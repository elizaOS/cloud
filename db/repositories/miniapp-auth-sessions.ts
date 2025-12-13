/**
 * Miniapp Auth Sessions Repository
 *
 * Database operations for miniapp authentication sessions.
 */

import { eq, and, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  miniappAuthSessions,
  type MiniappAuthSession,
  type NewMiniappAuthSession,
} from "@/db/schemas/miniapp-auth-sessions";

class MiniappAuthSessionsRepository {
  /**
   * Create a new auth session
   */
  async create(data: NewMiniappAuthSession): Promise<MiniappAuthSession> {
    const [session] = await db
      .insert(miniappAuthSessions)
      .values(data)
      .returning();
    return session;
  }

  /**
   * Get session by session_id
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
   * Get active (non-expired, pending) session by session_id
   */
  async getActiveSession(
    sessionId: string,
  ): Promise<MiniappAuthSession | null> {
    const [session] = await db
      .select()
      .from(miniappAuthSessions)
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          gt(miniappAuthSessions.expires_at, new Date()),
        ),
      )
      .limit(1);
    return session || null;
  }

  /**
   * Mark session as authenticated and store auth token
   */
  async markAuthenticated(
    sessionId: string,
    userId: string,
    organizationId: string,
    authToken: string,
    authTokenHash: string,
  ): Promise<MiniappAuthSession | null> {
    const [session] = await db
      .update(miniappAuthSessions)
      .set({
        status: "authenticated",
        user_id: userId,
        organization_id: organizationId,
        auth_token: authToken,
        auth_token_hash: authTokenHash,
        authenticated_at: new Date(),
      })
      .where(
        and(
          eq(miniappAuthSessions.session_id, sessionId),
          eq(miniappAuthSessions.status, "pending"),
        ),
      )
      .returning();
    return session || null;
  }

  /**
   * Get and clear auth token (one-time retrieval for security)
   */
  async getAndClearAuthToken(
    sessionId: string,
  ): Promise<{
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
   * Verify an auth token against stored hash
   */
  async verifyAuthToken(
    authTokenHash: string,
  ): Promise<{ userId: string; organizationId: string } | null> {
    const [session] = await db
      .select()
      .from(miniappAuthSessions)
      .where(
        and(
          eq(miniappAuthSessions.auth_token_hash, authTokenHash),
          gt(miniappAuthSessions.expires_at, new Date()),
        ),
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
   * Delete expired sessions (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(miniappAuthSessions)
      .where(
        and(
          gt(new Date(), miniappAuthSessions.expires_at),
          isNull(miniappAuthSessions.user_id),
        ),
      );
    return result.rowCount || 0;
  }
}

export const miniappAuthSessionsRepository =
  new MiniappAuthSessionsRepository();
