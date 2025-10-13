import { db, schema, eq, and, desc, sql } from "@/lib/db";
import type { SQL } from "drizzle-orm";

export type TimeGranularity = "hour" | "day" | "week" | "month";

const VALID_GRANULARITIES = ["hour", "day", "week", "month"] as const;

export function validateGranularity(
  granularity: string
): granularity is TimeGranularity {
  return VALID_GRANULARITIES.includes(granularity as TimeGranularity);
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  totalRequests: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  successRate: number;
}

export interface UserUsageBreakdown {
  userId: string;
  userName: string | null;
  userEmail: string;
  totalRequests: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  lastActive: Date | null;
}

export interface CostTrending {
  currentDailyBurn: number;
  previousDailyBurn: number;
  burnChangePercent: number;
  projectedMonthlyBurn: number;
  daysUntilBalanceZero: number | null;
}

export interface ProviderBreakdown {
  provider: string;
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  successRate: number;
  percentage: number;
}

export interface ModelBreakdown {
  model: string;
  provider: string;
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  avgCostPerToken: number;
  successRate: number;
}

export interface TrendData {
  requestsChange: number;
  costChange: number;
  tokensChange: number;
  successRateChange: number;
  period: string;
}

export interface CostBreakdownItem {
  dimension: string;
  value: string;
  cost: number;
  requests: number;
  tokens: number;
  successCount: number;
  totalCount: number;
}

export interface UsageStats {
  totalRequests: number;
  totalCost: number;
  successRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function safeAggregate<T extends Record<string, unknown>>(
  result: T[],
  defaults: T
): T {
  return result[0] || defaults;
}

export async function getUsageStatsSafe(
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<UsageStats> {
  const conditions: SQL[] = [
    eq(schema.usageRecords.organization_id, organizationId),
  ];

  if (options?.startDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} >= ${options.startDate}`
    );
  }
  if (options?.endDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} <= ${options.endDate}`
    );
  }

  const result = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.usageRecords.output_tokens}), 0)::int`,
      successRate: sql<number>`coalesce(
        count(*) filter (where ${schema.usageRecords.is_successful} = true)::float /
        nullif(count(*)::float, 0),
        1.0
      )`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions));

  return safeAggregate(result, {
    totalRequests: 0,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    successRate: 1.0,
  });
}

export async function getUsageTimeSeries(
  organizationId: string,
  options: {
    startDate: Date;
    endDate: Date;
    granularity: TimeGranularity;
  }
): Promise<TimeSeriesDataPoint[]> {
  const { startDate, endDate, granularity } = options;

  if (!validateGranularity(granularity)) {
    throw new Error(
      `Invalid granularity: ${granularity}. Must be one of: ${VALID_GRANULARITIES.join(", ")}`
    );
  }

  const truncateExpression = {
    hour: sql`date_trunc('hour', ${schema.usageRecords.created_at})`,
    day: sql`date_trunc('day', ${schema.usageRecords.created_at})`,
    week: sql`date_trunc('week', ${schema.usageRecords.created_at})`,
    month: sql`date_trunc('month', ${schema.usageRecords.created_at})`,
  }[granularity];

  const result = await db
    .select({
      timestamp: truncateExpression.as("timestamp"),
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageRecords.output_tokens}), 0)::int`,
      successRate: sql<number>`coalesce(
        count(*) filter (where ${schema.usageRecords.is_successful} = true)::float /
        nullif(count(*)::float, 0),
        1.0
      )`,
    })
    .from(schema.usageRecords)
    .where(
      and(
        eq(schema.usageRecords.organization_id, organizationId),
        sql`${schema.usageRecords.created_at} >= ${startDate}`,
        sql`${schema.usageRecords.created_at} <= ${endDate}`
      )
    )
    .groupBy(truncateExpression)
    .orderBy(truncateExpression);

  return result.map((row) => ({
    timestamp: new Date(row.timestamp as string),
    totalRequests: row.totalRequests,
    totalCost: row.totalCost,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    successRate: row.successRate,
  }));
}

export async function getUsageByUser(
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<UserUsageBreakdown[]> {
  const { startDate, endDate, limit = 50 } = options || {};

  const conditions: SQL[] = [
    eq(schema.usageRecords.organization_id, organizationId),
  ];

  if (startDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} >= ${startDate}`
    );
  }
  if (endDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} <= ${endDate}`
    );
  }

  const result = await db
    .select({
      userId: schema.usageRecords.user_id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageRecords.output_tokens}), 0)::int`,
      lastActive: sql<Date>`max(${schema.usageRecords.created_at})`,
    })
    .from(schema.usageRecords)
    .leftJoin(schema.users, eq(schema.usageRecords.user_id, schema.users.id))
    .where(and(...conditions))
    .groupBy(
      schema.usageRecords.user_id,
      schema.users.name,
      schema.users.email
    )
    .orderBy(
      desc(
        sql`sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost})`
      )
    )
    .limit(limit);

  return result
    .filter((row) => row.userId !== null && row.userEmail !== null)
    .map((row) => ({
      userId: row.userId!,
      userName: row.userName,
      userEmail: row.userEmail!,
      totalRequests: row.totalRequests,
      totalCost: row.totalCost,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      lastActive: row.lastActive,
    }));
}

export async function getCostTrending(
  organizationId: string
): Promise<CostTrending> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [currentStats, previousStats, orgData] = await Promise.all([
    getUsageStatsSafe(organizationId, {
      startDate: yesterday,
      endDate: now,
    }),
    getUsageStatsSafe(organizationId, {
      startDate: twoDaysAgo,
      endDate: yesterday,
    }),
    db.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
      columns: { credit_balance: true },
    }),
  ]);

  const currentDailyBurn = currentStats.totalCost;
  const previousDailyBurn = previousStats.totalCost;
  const burnChangePercent =
    previousDailyBurn > 0
      ? ((currentDailyBurn - previousDailyBurn) / previousDailyBurn) * 100
      : 0;

  const projectedMonthlyBurn = currentDailyBurn * 30;
  const creditBalance = orgData?.credit_balance || 0;
  const daysUntilBalanceZero =
    currentDailyBurn > 0 ? Math.floor(creditBalance / currentDailyBurn) : null;

  return {
    currentDailyBurn,
    previousDailyBurn,
    burnChangePercent,
    projectedMonthlyBurn,
    daysUntilBalanceZero,
  };
}

export async function getProviderBreakdown(
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<ProviderBreakdown[]> {
  const conditions: SQL[] = [
    eq(schema.usageRecords.organization_id, organizationId),
  ];

  if (options?.startDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} >= ${options.startDate}`
    );
  }
  if (options?.endDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} <= ${options.endDate}`
    );
  }

  const result = await db
    .select({
      provider: schema.usageRecords.provider,
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens} + ${schema.usageRecords.output_tokens}), 0)::int`,
      successRate: sql<number>`coalesce(
        count(*) filter (where ${schema.usageRecords.is_successful} = true)::float /
        nullif(count(*)::float, 0),
        1.0
      )`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions))
    .groupBy(schema.usageRecords.provider)
    .orderBy(
      desc(
        sql`sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost})`
      )
    );

  const totalCost = result.reduce((sum, row) => sum + row.totalCost, 0);

  return result.map((row) => ({
    provider: row.provider,
    totalRequests: row.totalRequests,
    totalCost: row.totalCost,
    totalTokens: row.totalTokens,
    successRate: row.successRate,
    percentage: totalCost > 0 ? (row.totalCost / totalCost) * 100 : 0,
  }));
}

export async function getModelBreakdown(
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date; limit?: number }
): Promise<ModelBreakdown[]> {
  const { startDate, endDate, limit = 50 } = options || {};

  const conditions: SQL[] = [
    eq(schema.usageRecords.organization_id, organizationId),
  ];

  if (startDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} >= ${startDate}`
    );
  }
  if (endDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} <= ${endDate}`
    );
  }

  const result = await db
    .select({
      model: schema.usageRecords.model,
      provider: schema.usageRecords.provider,
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens} + ${schema.usageRecords.output_tokens}), 0)::int`,
      successRate: sql<number>`coalesce(
        count(*) filter (where ${schema.usageRecords.is_successful} = true)::float /
        nullif(count(*)::float, 0),
        1.0
      )`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions))
    .groupBy(schema.usageRecords.model, schema.usageRecords.provider)
    .orderBy(
      desc(
        sql`sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost})`
      )
    )
    .limit(limit);

  return result.map((row) => ({
    model: row.model || "unknown",
    provider: row.provider,
    totalRequests: row.totalRequests,
    totalCost: row.totalCost,
    totalTokens: row.totalTokens,
    avgCostPerToken:
      row.totalTokens > 0 ? row.totalCost / row.totalTokens : 0,
    successRate: row.successRate,
  }));
}

export async function getTrendData(
  organizationId: string,
  currentPeriod: { startDate: Date; endDate: Date },
  previousPeriod: { startDate: Date; endDate: Date }
): Promise<TrendData> {
  const [currentStats, previousStats] = await Promise.all([
    getUsageStatsSafe(organizationId, currentPeriod),
    getUsageStatsSafe(organizationId, previousPeriod),
  ]);

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const periodDays = Math.ceil(
    (currentPeriod.endDate.getTime() - currentPeriod.startDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return {
    requestsChange: calculateChange(
      currentStats.totalRequests,
      previousStats.totalRequests
    ),
    costChange: calculateChange(currentStats.totalCost, previousStats.totalCost),
    tokensChange: calculateChange(
      currentStats.totalInputTokens + currentStats.totalOutputTokens,
      previousStats.totalInputTokens + previousStats.totalOutputTokens
    ),
    successRateChange: calculateChange(
      currentStats.successRate,
      previousStats.successRate
    ),
    period: `${periodDays}d`,
  };
}

export async function getCostBreakdown(
  organizationId: string,
  dimension: "model" | "provider" | "user" | "apiKey",
  options?: {
    startDate?: Date;
    endDate?: Date;
    sortBy?: "cost" | "requests" | "tokens";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }
): Promise<CostBreakdownItem[]> {
  const {
    startDate,
    endDate,
    sortBy = "cost",
    sortOrder = "desc",
    limit = 100,
    offset = 0,
  } = options || {};

  const conditions: SQL[] = [
    eq(schema.usageRecords.organization_id, organizationId),
  ];

  if (startDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} >= ${startDate}`
    );
  }
  if (endDate) {
    conditions.push(
      sql`${schema.usageRecords.created_at} <= ${endDate}`
    );
  }

  const dimensionColumn = {
    model: schema.usageRecords.model,
    provider: schema.usageRecords.provider,
    user: schema.usageRecords.user_id,
    apiKey: schema.usageRecords.api_key_id,
  }[dimension];

  const sortColumn = {
    cost: sql`sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost})`,
    requests: sql`count(*)`,
    tokens: sql`sum(${schema.usageRecords.input_tokens} + ${schema.usageRecords.output_tokens})`,
  }[sortBy];

  const orderDirection = sortOrder === "desc" ? desc(sortColumn) : sortColumn;

  const result = await db
    .select({
      value: dimensionColumn,
      cost: sql<number>`coalesce(sum(${schema.usageRecords.input_cost} + ${schema.usageRecords.output_cost}), 0)::int`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${schema.usageRecords.input_tokens} + ${schema.usageRecords.output_tokens}), 0)::int`,
      successCount: sql<number>`count(*) filter (where ${schema.usageRecords.is_successful} = true)::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(schema.usageRecords)
    .where(and(...conditions))
    .groupBy(dimensionColumn)
    .orderBy(orderDirection)
    .limit(limit)
    .offset(offset);

  return result.map((row) => ({
    dimension,
    value: row.value || "unknown",
    cost: row.cost,
    requests: row.requests,
    tokens: row.tokens,
    successCount: row.successCount,
    totalCount: row.totalCount,
  }));
}
