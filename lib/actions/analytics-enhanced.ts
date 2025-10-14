"use server";

import { requireAuth } from "@/lib/auth";
import {
  getUsageStatsSafe,
  getUsageTimeSeries,
  getUsageByUser,
  getCostTrending,
  getProviderBreakdown,
  getModelBreakdown,
  getTrendData,
  type TimeGranularity,
  organizationsService,
} from "@/lib/services";
import {
  generateProjections,
  generateProjectionAlerts,
} from "@/lib/analytics/projections";

export interface EnhancedAnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  granularity?: TimeGranularity;
  timeRange?: "daily" | "weekly" | "monthly";
}

export async function getEnhancedAnalyticsData(
  filters: EnhancedAnalyticsFilters = {}
) {
  const user = await requireAuth();
  const organizationId = user.organization_id;

  const timeRange = filters.timeRange || "weekly";
  const now = new Date();

  let startDate: Date;
  let endDate: Date = now;
  let granularity: TimeGranularity;

  switch (timeRange) {
    case "daily":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      granularity = "hour";
      break;
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      granularity = "day";
      break;
    case "monthly":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      granularity = "day";
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      granularity = "day";
  }

  if (filters.startDate) startDate = filters.startDate;
  if (filters.endDate) endDate = filters.endDate;
  if (filters.granularity) granularity = filters.granularity;

  const periodLength = endDate.getTime() - startDate.getTime();
  const previousEndDate = startDate;
  const previousStartDate = new Date(startDate.getTime() - periodLength);

  const [
    overallStats,
    timeSeriesData,
    userBreakdown,
    costTrending,
    providerBreakdown,
    modelBreakdown,
    trends,
  ] = await Promise.all([
    getUsageStatsSafe(organizationId, { startDate, endDate }),
    getUsageTimeSeries(organizationId, { startDate, endDate, granularity }),
    getUsageByUser(organizationId, { startDate, endDate, limit: 10 }),
    getCostTrending(organizationId),
    getProviderBreakdown(organizationId, { startDate, endDate }),
    getModelBreakdown(organizationId, { startDate, endDate, limit: 20 }),
    getTrendData(
      organizationId,
      { startDate, endDate },
      { startDate: previousStartDate, endDate: previousEndDate }
    ),
  ]);

  return {
    filters: {
      startDate,
      endDate,
      granularity,
      timeRange,
    },
    overallStats,
    timeSeriesData,
    userBreakdown,
    costTrending,
    providerBreakdown,
    modelBreakdown,
    trends,
    organization: {
      creditBalance: user.organization.credit_balance,
    },
  };
}

export async function getProjectionsData(periods: number = 7) {
  const user = await requireAuth();
  const organizationId = user.organization_id;

  const now = new Date();
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [historicalData, org] = await Promise.all([
    getUsageTimeSeries(organizationId, {
      startDate,
      endDate: now,
      granularity: "day",
    }),
    organizationsService.getById(organizationId),
  ]);

  const creditBalance = org?.credit_balance || 0;
  const projections = generateProjections(historicalData, periods);
  const alerts = generateProjectionAlerts(
    historicalData,
    projections,
    creditBalance
  );

  return {
    historicalData,
    projections,
    alerts,
    creditBalance,
  };
}

export type EnhancedAnalyticsData = Awaited<
  ReturnType<typeof getEnhancedAnalyticsData>
>;
export type ProjectionsData = Awaited<ReturnType<typeof getProjectionsData>>;
