import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db } from "../client";
import {
  userSessions,
  type UserSession,
  type NewUserSession,
} from "../schemas/user-sessions";

export type { UserSession, NewUserSession };

export class UserSessionsRepository {
  async findById(id: string): Promise<UserSession | undefined> {
    return await db.query.userSessions.findFirst({
      where: eq(userSessions.id, id),
    });
  }

  async findActiveByToken(
    sessionToken: string,
  ): Promise<UserSession | undefined> {
    return await db.query.userSessions.findFirst({
      where: and(
        eq(userSessions.session_token, sessionToken),
        isNull(userSessions.ended_at),
      ),
    });
  }

  async listActiveByUser(userId: string): Promise<UserSession[]> {
    return await db.query.userSessions.findMany({
      where: and(
        eq(userSessions.user_id, userId),
        isNull(userSessions.ended_at),
      ),
      orderBy: desc(userSessions.last_activity_at),
    });
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<UserSession[]> {
    return await db.query.userSessions.findMany({
      where: eq(userSessions.organization_id, organizationId),
      orderBy: desc(userSessions.started_at),
      limit,
    });
  }

  async create(data: NewUserSession): Promise<UserSession> {
    const [session] = await db.insert(userSessions).values(data).returning();
    return session;
  }

  /**
   * Atomic get-or-create session using Drizzle's onConflictDoUpdate
   * Prevents race conditions by handling conflicts at the database level
   */
  async getOrCreate(data: NewUserSession): Promise<UserSession> {
    // Use onConflictDoUpdate to atomically handle the race condition
    // If session_token already exists, update last_activity_at and return existing
    const [session] = await db
      .insert(userSessions)
      .values(data)
      .onConflictDoUpdate({
        target: userSessions.session_token,
        set: {
          last_activity_at: new Date(),
          updated_at: new Date(),
        },
      })
      .returning();

    return session;
  }

  async updateMetrics(
    sessionToken: string,
    metrics: {
      credits_used?: number;
      requests_made?: number;
      tokens_consumed?: number;
    },
  ): Promise<UserSession | undefined> {
    const updateFields: Record<string, any> = {
      last_activity_at: new Date(),
      updated_at: new Date(),
    };

    if (metrics.credits_used !== undefined) {
      updateFields.credits_used = String(metrics.credits_used);
    }

    if (metrics.requests_made !== undefined) {
      updateFields.requests_made = metrics.requests_made;
    }

    if (metrics.tokens_consumed !== undefined) {
      updateFields.tokens_consumed = metrics.tokens_consumed;
    }

    const [updated] = await db
      .update(userSessions)
      .set(updateFields)
      .where(eq(userSessions.session_token, sessionToken))
      .returning();
    return updated;
  }

  async incrementMetrics(
    sessionToken: string,
    increments: {
      credits_used?: number;
      requests_made?: number;
      tokens_consumed?: number;
    },
  ): Promise<UserSession | undefined> {
    const updateFields: Record<string, any> = {
      last_activity_at: new Date(),
      updated_at: new Date(),
    };

    if (increments.credits_used !== undefined) {
      updateFields.credits_used = sql`${userSessions.credits_used} + ${increments.credits_used}`;
    }

    if (increments.requests_made !== undefined) {
      updateFields.requests_made = sql`${userSessions.requests_made} + ${increments.requests_made}`;
    }

    if (increments.tokens_consumed !== undefined) {
      updateFields.tokens_consumed = sql`${userSessions.tokens_consumed} + ${increments.tokens_consumed}`;
    }

    const [updated] = await db
      .update(userSessions)
      .set(updateFields)
      .where(
        and(
          eq(userSessions.session_token, sessionToken),
          isNull(userSessions.ended_at),
        ),
      )
      .returning();

    return updated;
  }

  async endSession(sessionToken: string): Promise<UserSession | undefined> {
    const [updated] = await db
      .update(userSessions)
      .set({
        ended_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(userSessions.session_token, sessionToken))
      .returning();
    return updated;
  }

  async endAllUserSessions(userId: string): Promise<number> {
    const result = await db
      .update(userSessions)
      .set({
        ended_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(eq(userSessions.user_id, userId), isNull(userSessions.ended_at)),
      );

    return result.rowCount || 0;
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(userSessions)
      .where(sql`${userSessions.ended_at} < ${cutoffDate}`);

    return result.rowCount || 0;
  }

  async getCurrentSessionStats(userId: string): Promise<{
    credits_used: number;
    requests_made: number;
    tokens_consumed: number;
  } | null> {
    const activeSessions = await db.query.userSessions.findMany({
      where: and(
        eq(userSessions.user_id, userId),
        isNull(userSessions.ended_at),
      ),
    });

    if (activeSessions.length === 0) {
      return null;
    }

    const stats = activeSessions.reduce(
      (acc, session) => ({
        credits_used: acc.credits_used + Number(session.credits_used || 0),
        requests_made: acc.requests_made + (session.requests_made || 0),
        tokens_consumed: acc.tokens_consumed + (session.tokens_consumed || 0),
      }),
      { credits_used: 0, requests_made: 0, tokens_consumed: 0 },
    );

    return stats;
  }
}

export const userSessionsRepository = new UserSessionsRepository();
