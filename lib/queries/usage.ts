import { db, schema, eq, and, desc, sql } from "@/lib/db";
import type { UsageRecord, NewUsageRecord } from "@/lib/types";

export async function createUsageRecord(
  data: NewUsageRecord,
): Promise<UsageRecord> {
  const [record] = await db
    .insert(schema.usageRecords)
    .values(data)
    .returning();
  return record;
}

export async function getUsageRecordById(
  id: string,
): Promise<UsageRecord | undefined> {
  return await db.query.usageRecords.findFirst({
    where: eq(schema.usageRecords.id, id),
  });
}

export async function listUsageRecordsByOrganization(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  },
): Promise<UsageRecord[]> {
  const { limit = 100, offset = 0, startDate, endDate } = options || {};

  const conditions = [eq(schema.usageRecords.organization_id, organizationId)];

  if (startDate) {
    conditions.push(sql`${schema.usageRecords.created_at} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${schema.usageRecords.created_at} <= ${endDate}`);
  }

  return await db.query.usageRecords.findMany({
    where: and(...conditions),
    orderBy: desc(schema.usageRecords.created_at),
    limit,
    offset,
  });
}

export async function getUsageStatsByOrganization(
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
  },
): Promise<{
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  successfulRequests: number;
  failedRequests: number;
}> {
  const { startDate, endDate } = options || {};

  const conditions = [eq(schema.usageRecords.organization_id, organizationId)];

  if (startDate) {
    conditions.push(sql`${schema.usageRecords.created_at} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${schema.usageRecords.created_at} <= ${endDate}`);
  }

  const result = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.usageRecords.output_tokens}), 0)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      successfulRequests: sql<number>`count(*) filter (where ${schema.usageRecords.is_successful} = true)::int`,
      failedRequests: sql<number>`count(*) filter (where ${schema.usageRecords.is_successful} = false)::int`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions));

  return (
    result[0] || {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      successfulRequests: 0,
      failedRequests: 0,
    }
  );
}

export async function getUsageByModel(
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
  },
): Promise<
  Array<{
    model: string | null;
    provider: string;
    count: number;
    totalCost: number;
  }>
> {
  const { startDate, endDate } = options || {};

  const conditions = [eq(schema.usageRecords.organization_id, organizationId)];

  if (startDate) {
    conditions.push(sql`${schema.usageRecords.created_at} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${schema.usageRecords.created_at} <= ${endDate}`);
  }

  const result = await db
    .select({
      model: schema.usageRecords.model,
      provider: schema.usageRecords.provider,
      count: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions))
    .groupBy(schema.usageRecords.model, schema.usageRecords.provider);

  return result;
}
