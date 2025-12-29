/**
 * Enhanced analytics data actions.
 *
 * This module re-exports client API functions for enhanced analytics.
 * Previously used "use server" directives, now uses client API routes.
 */

import { analyticsApi } from "@/lib/api/client";

/**
 * Enhanced filters for analytics queries with time range presets.
 */
export interface EnhancedAnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  granularity?: "hour" | "day" | "week" | "month";
  timeRange?: "daily" | "weekly" | "monthly";
}

/**
 * Gets enhanced analytics data with provider/model breakdowns and trend comparisons.
 */
export async function getEnhancedAnalyticsData(filters: EnhancedAnalyticsFilters = {}) {
  const timeRange = filters.timeRange ?? "weekly";

  const [overviewResponse, breakdownResponse] = await Promise.all([
    analyticsApi.getOverview(timeRange),
    analyticsApi.getBreakdown({
      dimension: "model",
      startDate: filters.startDate,
      endDate: filters.endDate,
    }),
  ]);

  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case "daily":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return {
    filters: {
      startDate: filters.startDate ?? startDate,
      endDate: filters.endDate ?? now,
      granularity: filters.granularity ?? "day",
      timeRange,
    },
    overallStats: overviewResponse.data,
    modelBreakdown: breakdownResponse.data,
  };
}

/**
 * Gets cost projections and alerts based on historical usage data.
 */
export async function getProjectionsData(periods = 7) {
  const response = await analyticsApi.getProjections({
    timeRange: "daily",
    periods,
  });
  return response.data;
}

export type EnhancedAnalyticsData = Awaited<ReturnType<typeof getEnhancedAnalyticsData>>;
export type ProjectionsData = Awaited<ReturnType<typeof getProjectionsData>>;
