import { db } from "@/db/client";
import { anonymousSessions, type AnonymousSession } from "@/db/schemas";
import { eq, and, lt, gte } from "drizzle-orm";

/**
 * Anonymous Sessions Repository
 *
 * Handles CRUD operations for anonymous user sessions.
 * Used for tracking free tier usage and rate limiting.
 */
export class AnonymousSessionsRepository {
  /**
   * Get session by token
   */
  async getByToken(sessionToken: string): Promise<AnonymousSession | null> {
    const [session] = await db
      .select()
      .from(anonymousSessions)
      .where(
        and(
          eq(anonymousSessions.session_token, sessionToken),
          eq(anonymousSessions.is_active, true),
          gte(anonymousSessions.expires_at, new Date()),
        ),
      )
      .limit(1);

    return session || null;
  }

  /**
   * Get session by user ID
   */
  async getByUserId(userId: string): Promise<AnonymousSession | null> {
    const [session] = await db
      .select()
      .from(anonymousSessions)
      .where(eq(anonymousSessions.user_id, userId))
      .limit(1);

    return session || null;
  }

  /**
   * Create new anonymous session
   */
  async create(data: {
    session_token: string;
    user_id: string;
    expires_at: Date;
    ip_address?: string;
    user_agent?: string;
    fingerprint?: string;
    messages_limit?: number;
  }): Promise<AnonymousSession> {
    const [session] = await db
      .insert(anonymousSessions)
      .values({
        session_token: data.session_token,
        user_id: data.user_id,
        expires_at: data.expires_at,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        fingerprint: data.fingerprint,
        messages_limit: data.messages_limit || 10,
      })
      .returning();

    return session;
  }

  /**
   * Increment message count for a session
   * Returns updated session
   */
  async incrementMessageCount(sessionId: string): Promise<AnonymousSession> {
    // Get current session first
    const current = await db.query.anonymousSessions.findFirst({
      where: eq(anonymousSessions.id, sessionId),
    });

    if (!current) {
      throw new Error("Session not found");
    }

    const [session] = await db
      .update(anonymousSessions)
      .set({
        message_count: current.message_count + 1,
        last_message_at: new Date(),
      })
      .where(eq(anonymousSessions.id, sessionId))
      .returning();

    return session;
  }

  /**
   * Increment hourly message count (for rate limiting)
   * Resets hourly counter if hour has passed
   */
  async incrementHourlyCount(
    sessionId: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const session = await db.query.anonymousSessions.findFirst({
      where: eq(anonymousSessions.id, sessionId),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check if we need to reset hourly counter
    const needsReset =
      !session.hourly_reset_at || session.hourly_reset_at < oneHourAgo;

    if (needsReset) {
      // Reset counter
      const [updated] = await db
        .update(anonymousSessions)
        .set({
          hourly_message_count: 1,
          hourly_reset_at: now,
          last_message_at: now,
        })
        .where(eq(anonymousSessions.id, sessionId))
        .returning();

      return { allowed: true, remaining: 9 }; // Assuming 10 messages per hour limit
    }

    // Check if limit reached (10 messages per hour)
    const hourlyLimit = 10;
    if (session.hourly_message_count >= hourlyLimit) {
      return { allowed: false, remaining: 0 };
    }

    // Increment counter
    const [updated] = await db
      .update(anonymousSessions)
      .set({
        hourly_message_count: session.hourly_message_count + 1,
        last_message_at: now,
      })
      .where(eq(anonymousSessions.id, sessionId))
      .returning();

    return {
      allowed: true,
      remaining: hourlyLimit - updated.hourly_message_count,
    };
  }

  /**
   * Track token usage (for analytics, not billing)
   */
  async addTokenUsage(sessionId: string, tokens: number): Promise<void> {
    const current = await db.query.anonymousSessions.findFirst({
      where: eq(anonymousSessions.id, sessionId),
    });

    if (!current) {
      throw new Error("Session not found");
    }

    await db
      .update(anonymousSessions)
      .set({
        total_tokens_used: current.total_tokens_used + tokens,
      })
      .where(eq(anonymousSessions.id, sessionId));
  }

  /**
   * Mark that user was prompted to sign up
   */
  async incrementSignupPrompt(sessionId: string): Promise<void> {
    const current = await db.query.anonymousSessions.findFirst({
      where: eq(anonymousSessions.id, sessionId),
    });

    if (!current) {
      throw new Error("Session not found");
    }

    await db
      .update(anonymousSessions)
      .set({
        signup_prompted_at: new Date(),
        signup_prompt_count: current.signup_prompt_count + 1,
      })
      .where(eq(anonymousSessions.id, sessionId));
  }

  /**
   * Mark session as converted (user signed up)
   */
  async markConverted(sessionId: string): Promise<void> {
    await db
      .update(anonymousSessions)
      .set({
        converted_at: new Date(),
        is_active: false,
      })
      .where(eq(anonymousSessions.id, sessionId));
  }

  /**
   * Deactivate session
   */
  async deactivate(sessionId: string): Promise<void> {
    await db
      .update(anonymousSessions)
      .set({
        is_active: false,
      })
      .where(eq(anonymousSessions.id, sessionId));
  }

  /**
   * Delete expired sessions (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const now = new Date();
    const result = await db
      .delete(anonymousSessions)
      .where(lt(anonymousSessions.expires_at, now));

    return result.rowCount || 0;
  }

  /**
   * Get all sessions by IP address (abuse detection)
   */
  async getByIpAddress(ipAddress: string): Promise<AnonymousSession[]> {
    return await db
      .select()
      .from(anonymousSessions)
      .where(
        and(
          eq(anonymousSessions.ip_address, ipAddress),
          eq(anonymousSessions.is_active, true),
        ),
      );
  }

  /**
   * Count active sessions by IP (abuse detection)
   */
  async countActiveSessionsByIp(ipAddress: string): Promise<number> {
    const sessions = await this.getByIpAddress(ipAddress);
    return sessions.length;
  }
}

// Export singleton instance
export const anonymousSessionsRepository = new AnonymousSessionsRepository();
