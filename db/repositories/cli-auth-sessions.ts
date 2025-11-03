import { db } from "@/db/client";
import {
  cliAuthSessions,
  type CliAuthSession,
  type NewCliAuthSession,
} from "@/db/schemas/cli-auth-sessions";
import { eq, and, gt, lt } from "drizzle-orm";

export type { CliAuthSession, NewCliAuthSession };

export class CliAuthSessionsRepository {
  async create(data: NewCliAuthSession): Promise<CliAuthSession> {
    const [session] = await db.insert(cliAuthSessions).values(data).returning();

    if (!session) {
      throw new Error("Failed to create CLI auth session");
    }

    return session;
  }

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

  async clearPlainKey(sessionId: string): Promise<void> {
    await db
      .update(cliAuthSessions)
      .set({
        api_key_plain: null,
        updated_at: new Date(),
      })
      .where(eq(cliAuthSessions.session_id, sessionId));
  }

  async markExpired(sessionId: string): Promise<void> {
    await db
      .update(cliAuthSessions)
      .set({
        status: "expired",
        updated_at: new Date(),
      })
      .where(eq(cliAuthSessions.session_id, sessionId));
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = new Date();
    await db.delete(cliAuthSessions).where(lt(cliAuthSessions.expires_at, now));
  }
}

export const cliAuthSessionsRepository = new CliAuthSessionsRepository();
