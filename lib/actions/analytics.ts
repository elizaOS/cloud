"use server";

import { requireAuth } from "@/lib/auth";
import {
  getUsageStatsSafe,
  getUsageTimeSeries,
  getUsageByUser,
  getCostTrending,
  type TimeGranularity,
} from "@/lib/queries/analytics";

export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  granularity?: TimeGranularity;
  modelFilter?: string;
  providerFilter?: string;
}

export async function getAnalyticsData(filters: AnalyticsFilters = {}) {
  const user = await requireAuth();
  const organizationId = user.organization_id;

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date(),
    granularity = "day" as TimeGranularity,
  } = filters;

  const [overallStats, timeSeriesData, userBreakdown, costTrending] =
    await Promise.all([
      getUsageStatsSafe(organizationId, { startDate, endDate }),
      getUsageTimeSeries(organizationId, { startDate, endDate, granularity }),
      getUsageByUser(organizationId, { startDate, endDate, limit: 10 }),
      getCostTrending(organizationId),
    ]);

  return {
    filters: {
      startDate,
      endDate,
      granularity,
    },
    overallStats,
    timeSeriesData,
    userBreakdown,
    costTrending,
    organization: {
      creditBalance: user.organization.credit_balance,
    },
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof getAnalyticsData>>;
