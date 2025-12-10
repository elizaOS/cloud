/**
 * App Auth Sessions Repository
 *
 * Database operations for app authentication sessions.
 * Manages authentication sessions for the app pass-through auth flow.
 * Similar to CLI auth sessions but for web-based apps that can't use Privy directly.
 */

import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  appAuthSessions,
  type AppAuthSession,
  type NewAppAuthSession,
} from "@/db/schemas/app-auth-sessions";

/**
 * Repository for app authentication session database operations.
 */
class AppAuthSessionsRepository {
  /**
   * Creates a new app auth session.
   */
  async create(data: NewAppAuthSession): Promise<AppAuthSession> {
    const [session] = await db
      .insert(appAuthSessions)
      .values(data)
      .returning();
    return session;
  }

  /**
   * Gets a session by session ID.
   */
  async getBySessionId(sessionId: string): Promise<AppAuthSession | null> {
    const [session] = await db
      .select()
      .from(appAuthSessions)
      .where(eq(appAuthSessions.session_id, sessionId))
      .limit(1);
    return session || null;
  }

  /**
   * Gets an active (non-expired, pending) session by session ID.
   */
  async getActiveSession(
    sessionId: string,
  ): Promise<AppAuthSession | null> {
    const [session] = await db
      .select()
      .from(appAuthSessions)
      .where(
        and(
          eq(appAuthSessions.session_id, sessionId),
          gt(appAuthSessions.expires_at, new Date()),
        ),
      )
      .limit(1);
    return session || null;
  }

  /**
   * Marks a session as authenticated and stores user/org/auth token information.
   * 
   * Only updates sessions with status "pending".
   */
  async markAuthenticated(
    sessionId: string,
    userId: string,
    organizationId: string,
    authToken: string,
    authTokenHash: string,
  ): Promise<AppAuthSession | null> {
    const [session] = await db
      .update(appAuthSessions)
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
          eq(appAuthSessions.session_id, sessionId),
          eq(appAuthSessions.status, "pending"),
        ),
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
  async getAndClearAuthToken(
    sessionId: string,
  ): Promise<{
    authToken: string;
    userId: string;
    organizationId: string;
  } | null> {
    const [session] = await db
      .select()
      .from(appAuthSessions)
      .where(
        and(
          eq(appAuthSessions.session_id, sessionId),
          eq(appAuthSessions.status, "authenticated"),
        ),
      )
      .limit(1);

    if (
      !session ||
      !session.auth_token ||
      !session.user_id ||
      !session.organization_id
    ) {
      return null;
    }

    // Clear the auth token from the session record (keep the hash for verification)
    await db
      .update(appAuthSessions)
      .set({
        auth_token: null,
        status: "used",
        used_at: new Date(),
      })
      .where(eq(appAuthSessions.id, session.id));

    return {
      authToken: session.auth_token,
      userId: session.user_id,
      organizationId: session.organization_id,
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
    authTokenHash: string,
  ): Promise<{ userId: string; organizationId: string } | null> {
    const [session] = await db
      .select()
      .from(appAuthSessions)
      .where(
        and(
          eq(appAuthSessions.auth_token_hash, authTokenHash),
          gt(appAuthSessions.expires_at, new Date()),
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
   * Deletes expired sessions that were never authenticated (cleanup).
   * 
   * @returns Number of sessions deleted.
   */
  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(appAuthSessions)
      .where(
        and(
          gt(new Date(), appAuthSessions.expires_at),
          isNull(appAuthSessions.user_id),
        ),
      );
    return result.rowCount || 0;
  }
}

/**
 * Singleton instance of AppAuthSessionsRepository.
 */
export const appAuthSessionsRepository =
  new AppAuthSessionsRepository();
