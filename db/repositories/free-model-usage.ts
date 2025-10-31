import { eq, and, sql, sum } from "drizzle-orm";
import { db } from "../client";
import {
  freeModelUsage,
  type FreeModelUsage,
  type NewFreeModelUsage,
} from "../schemas/free-model-usage";

export type { FreeModelUsage, NewFreeModelUsage };

export class FreeModelUsageRepository {
  async create(data: NewFreeModelUsage): Promise<FreeModelUsage> {
    const [usage] = await db.insert(freeModelUsage).values(data).returning();
    return usage;
  }

  async incrementUsage(params: {
    organizationId: string;
    userId: string;
    model: string;
    provider: string;
    requestCount?: number;
    tokenCount?: number;
  }): Promise<FreeModelUsage> {
    const currentHour = new Date().getHours();
    const currentDate = new Date().toISOString().split("T")[0];

    const existing = await db.query.freeModelUsage.findFirst({
      where: and(
        eq(freeModelUsage.organization_id, params.organizationId),
        eq(freeModelUsage.user_id, params.userId),
        eq(freeModelUsage.model, params.model),
        eq(freeModelUsage.provider, params.provider),
        sql`${freeModelUsage.date}::text = ${currentDate}`,
        eq(freeModelUsage.hour, currentHour)
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(freeModelUsage)
        .set({
          request_count: existing.request_count + (params.requestCount || 1),
          token_count: existing.token_count + (params.tokenCount || 0),
        })
        .where(eq(freeModelUsage.id, existing.id))
        .returning();
      return updated;
    }

    return await this.create({
      organization_id: params.organizationId,
      user_id: params.userId,
      model: params.model,
      provider: params.provider,
      request_count: params.requestCount || 1,
      token_count: params.tokenCount || 0,
      date: currentDate,
      hour: currentHour,
      created_at: new Date(),
    });
  }

  async getUsageCount(params: {
    userId: string;
    model: string;
    provider: string;
    timeWindow: "minute" | "hour" | "day";
  }): Promise<number> {
    let timeCondition;

    switch (params.timeWindow) {
      case "minute":
        timeCondition = sql`${freeModelUsage.created_at} >= NOW() - INTERVAL '1 minute'`;
        break;
      case "hour":
        timeCondition = sql`${freeModelUsage.created_at} >= NOW() - INTERVAL '1 hour'`;
        break;
      case "day":
        timeCondition = sql`${freeModelUsage.created_at} >= NOW() - INTERVAL '1 day'`;
        break;
    }

    const result = await db
      .select({
        total: sum(freeModelUsage.request_count),
      })
      .from(freeModelUsage)
      .where(
        and(
          eq(freeModelUsage.user_id, params.userId),
          eq(freeModelUsage.model, params.model),
          eq(freeModelUsage.provider, params.provider),
          timeCondition
        )
      );

    return Number(result[0]?.total || 0);
  }

  async getUserDailyUsage(params: {
    userId: string;
    model: string;
    provider: string;
    date?: string;
  }): Promise<{ requestCount: number; tokenCount: number }> {
    const targetDate = params.date || new Date().toISOString().split("T")[0];

    const result = await db
      .select({
        requests: sum(freeModelUsage.request_count),
        tokens: sum(freeModelUsage.token_count),
      })
      .from(freeModelUsage)
      .where(
        and(
          eq(freeModelUsage.user_id, params.userId),
          eq(freeModelUsage.model, params.model),
          eq(freeModelUsage.provider, params.provider),
          sql`${freeModelUsage.date}::text = ${targetDate}`
        )
      );

    return {
      requestCount: Number(result[0]?.requests || 0),
      tokenCount: Number(result[0]?.tokens || 0),
    };
  }

  async getOrganizationUsage(params: {
    organizationId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<FreeModelUsage[]> {
    const conditions = [eq(freeModelUsage.organization_id, params.organizationId)];

    if (params.startDate) {
      conditions.push(
        sql`${freeModelUsage.date}::text >= ${params.startDate}`
      );
    }

    if (params.endDate) {
      conditions.push(
        sql`${freeModelUsage.date}::text <= ${params.endDate}`
      );
    }

    return await db.query.freeModelUsage.findMany({
      where: and(...conditions),
      orderBy: (freeModelUsage, { desc }) => [desc(freeModelUsage.created_at)],
    });
  }
}

export const freeModelUsageRepository = new FreeModelUsageRepository();
