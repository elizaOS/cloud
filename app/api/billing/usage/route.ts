import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { organizationsRepository } from "@/db/repositories";
import { db } from "@/db/client";
import { usageRecords } from "@/db/schemas/usage-records";
import { creditTransactions } from "@/db/schemas/credit-transactions";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { cache } from "@/lib/cache/client";

export const dynamic = "force-dynamic";

interface UsageResponse {
  credits: { remaining: number; used: number; initial: number };
  usage: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  period: { start: string; end: string };
  lastUpdated: string;
}

async function fetchUsageData(
  organizationId: string,
  days: number,
): Promise<UsageResponse | null> {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);

  const [org, transactionStats, usageStats, lastTransaction] =
    await Promise.all([
      organizationsRepository.findById(organizationId),
      db
        .select({
          totalDebits: sql<string>`COALESCE(SUM(CASE WHEN ${creditTransactions.type} = 'debit' THEN ABS(${creditTransactions.amount}) ELSE 0 END), 0)`,
          initialCredits: sql<string>`COALESCE(SUM(CASE WHEN ${creditTransactions.description} LIKE '%Initial%' OR ${creditTransactions.description} LIKE '%Welcome%' OR ${creditTransactions.description} LIKE '%Free%' THEN ${creditTransactions.amount} ELSE 0 END), 0)`,
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.organization_id, organizationId)),
      db
        .select({
          totalRequests: sql<number>`COUNT(*)::int`,
          successfulRequests: sql<number>`SUM(CASE WHEN ${usageRecords.is_successful} = true THEN 1 ELSE 0 END)::int`,
          failedRequests: sql<number>`SUM(CASE WHEN ${usageRecords.is_successful} = false THEN 1 ELSE 0 END)::int`,
          totalInputTokens: sql<number>`COALESCE(SUM(${usageRecords.input_tokens}), 0)::int`,
          totalOutputTokens: sql<number>`COALESCE(SUM(${usageRecords.output_tokens}), 0)::int`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.organization_id, organizationId),
            gte(usageRecords.created_at, periodStart),
          ),
        ),
      db
        .select({ created_at: creditTransactions.created_at })
        .from(creditTransactions)
        .where(eq(creditTransactions.organization_id, organizationId))
        .orderBy(desc(creditTransactions.created_at))
        .limit(1),
    ]);

  if (!org) return null;

  const remaining = Number(org.credit_balance || 0);
  const totalDebits = Number(transactionStats[0]?.totalDebits || 0);
  const initialCredits = Number(transactionStats[0]?.initialCredits || 0);
  const usage = usageStats[0];

  return {
    credits: {
      remaining,
      used: totalDebits,
      initial: initialCredits > 0 ? initialCredits : 5.0,
    },
    usage: {
      totalRequests: usage?.totalRequests || 0,
      successfulRequests: usage?.successfulRequests || 0,
      failedRequests: usage?.failedRequests || 0,
      totalTokens:
        (usage?.totalInputTokens || 0) + (usage?.totalOutputTokens || 0),
      inputTokens: usage?.totalInputTokens || 0,
      outputTokens: usage?.totalOutputTokens || 0,
    },
    period: { start: periodStart.toISOString(), end: new Date().toISOString() },
    lastUpdated:
      lastTransaction[0]?.created_at?.toISOString() ||
      org.updated_at.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id!;
    const days = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const cacheKey = `billing:usage:${organizationId}:${days}`;

    // Cache for 60 seconds with SWR (stale after 30s)
    const response = await cache.getWithSWR<UsageResponse>(cacheKey, 30, () =>
      fetchUsageData(organizationId, days),
    );

    if (!response) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error("[Billing Usage API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch usage",
      },
      { status: 500 },
    );
  }
}
