import { db } from "@/db/client";
import {
  cliAuthSessions,
  type CliAuthSession,
  type NewCliAuthSession,
} from "@/db/schemas/cli-auth-sessions";
import { eq, and, gt, lt } from "drizzle-orm";

export type { CliAuthSession, NewCliAuthSession };

/**
 * Repository for CLI authentication session database operations.
 */
export class CliAuthSessionsRepository {
  /**
   * Creates a new CLI auth session.
   * 
   * @throws Error if session creation fails.
   */
  async create(data: NewCliAuthSession): Promise<CliAuthSession> {
    const [session] = await db.insert(cliAuthSessions).values(data).returning();

    if (!session) {
      throw new Error("Failed to create CLI auth session");
    }

    return session;
  }

  /**
   * Finds a CLI auth session by session ID.
   */
  async findBySessionId(
    sessionId: string,
  ): Promise<CliAuthSession | undefined> {
    const [session] = await db
      .select()
      .from(cliAuthSessions)
      .where(eq(cliAuthSessions.session_id, sessionId))
      .limit(1);

    return session;
  }

  /**
   * Finds an active (non-expired) CLI auth session by session ID.
   */
  async findActiveBySessionId(
    sessionId: string,
  ): Promise<CliAuthSession | undefined> {
    const now = new Date();
    const [session] = await db
      .select()
      .from(cliAuthSessions)
      .where(
        and(
          eq(cliAuthSessions.session_id, sessionId),
          gt(cliAuthSessions.expires_at, now),
        ),
      )
      .limit(1);

    return session;
  }

  /**
   * Updates an existing CLI auth session.
   */
  async update(
    sessionId: string,
    data: Partial<NewCliAuthSession>,
  ): Promise<CliAuthSession | undefined> {
    const [updated] = await db
      .update(cliAuthSessions)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(cliAuthSessions.session_id, sessionId))
      .returning();

    return updated;
  }

  /**
   * Marks a session as authenticated and stores user/API key information.
   */
  async markAuthenticated(
    sessionId: string,
    userId: string,
    apiKeyId: string,
    apiKeyPlain: string,
  ): Promise<CliAuthSession | undefined> {
    return await this.update(sessionId, {
      status: "authenticated",
      user_id: userId,
      api_key_id: apiKeyId,
      api_key_plain: apiKeyPlain,
      authenticated_at: new Date(),
    });
  }

  /**
   * Clears the plain API key from a session (for security after retrieval).
   */
  async clearPlainKey(sessionId: string): Promise<void> {
    await db
      .update(cliAuthSessions)
      .set({
        api_key_plain: null,
        updated_at: new Date(),
      })
      .where(eq(cliAuthSessions.session_id, sessionId));
  }

  /**
   * Marks a session as expired.
   */
  async markExpired(sessionId: string): Promise<void> {
    await db
      .update(cliAuthSessions)
      .set({
        status: "expired",
        updated_at: new Date(),
      })
      .where(eq(cliAuthSessions.session_id, sessionId));
  }

  /**
   * Deletes all expired CLI auth sessions.
   */
  async deleteExpiredSessions(): Promise<void> {
    const now = new Date();
    await db.delete(cliAuthSessions).where(lt(cliAuthSessions.expires_at, now));
  }
}

/**
 * Singleton instance of CliAuthSessionsRepository.
 */
export const cliAuthSessionsRepository = new CliAuthSessionsRepository();
