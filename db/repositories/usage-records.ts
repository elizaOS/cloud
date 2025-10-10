import {
  eq,
  desc,
  and,
  gte,
  lte,
  sum,
  count,
  sql,
} from "drizzle-orm";
import { db } from "../client";
import { usageRecords, type UsageRecord, type NewUsageRecord } from "../schemas/usage-records";

export type { UsageRecord, NewUsageRecord };

export interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export class UsageRecordsRepository {
  async findById(id: string): Promise<UsageRecord | undefined> {
    return await db.query.usageRecords.findFirst({
      where: eq(usageRecords.id, id),
    });
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<UsageRecord[]> {
    return await db.query.usageRecords.findMany({
      where: eq(usageRecords.organization_id, organizationId),
      orderBy: desc(usageRecords.created_at),
      limit,
    });
  }

  async listByOrganizationAndDateRange(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UsageRecord[]> {
    return await db.query.usageRecords.findMany({
      where: and(
        eq(usageRecords.organization_id, organizationId),
        gte(usageRecords.created_at, startDate),
        lte(usageRecords.created_at, endDate),
      ),
      orderBy: desc(usageRecords.created_at),
    });
  }

  async getStatsByOrganization(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<UsageStats> {
    const conditions = [eq(usageRecords.organization_id, organizationId)];

    if (startDate) {
      conditions.push(gte(usageRecords.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(usageRecords.created_at, endDate));
    }

    const [stats] = await db
      .select({
        totalRequests: count(),
        totalInputTokens: sum(usageRecords.input_tokens),
        totalOutputTokens: sum(usageRecords.output_tokens),
        totalCost: sum(
          sql`${usageRecords.input_cost} + ${usageRecords.output_cost}`,
        ),
      })
      .from(usageRecords)
      .where(and(...conditions));

    return {
      totalRequests: stats?.totalRequests || 0,
      totalInputTokens: Number(stats?.totalInputTokens || 0),
      totalOutputTokens: Number(stats?.totalOutputTokens || 0),
      totalCost: Number(stats?.totalCost || 0),
    };
  }

  async create(data: NewUsageRecord): Promise<UsageRecord> {
    const [record] = await db.insert(usageRecords).values(data).returning();
    return record;
  }

  async getByModel(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      model: string | null;
      provider: string;
      count: number;
      totalCost: number;
    }>
  > {
    const conditions = [eq(usageRecords.organization_id, organizationId)];

    if (startDate) {
      conditions.push(gte(usageRecords.created_at, startDate));
    }

    if (endDate) {
      conditions.push(lte(usageRecords.created_at, endDate));
    }

    const result = await db
      .select({
        model: usageRecords.model,
        provider: usageRecords.provider,
        count: sql<number>`count(*)::int`,
        totalCost: sql<number>`sum(${usageRecords.input_cost} + ${usageRecords.output_cost})::int`,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .groupBy(usageRecords.model, usageRecords.provider);

    return result.map((r) => ({
      model: r.model,
      provider: r.provider,
      count: Number(r.count),
      totalCost: Number(r.totalCost || 0),
    }));
  }
}

// Export singleton instance
export const usageRecordsRepository = new UsageRecordsRepository();
