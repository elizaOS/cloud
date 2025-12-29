/**
 * Analytics data actions.
 *
 * This module re-exports client API functions for analytics data.
 * Previously used "use server" directives, now uses client API routes.
 */

import { analyticsApi, type AnalyticsFilters } from "@/lib/api/client";

export type { AnalyticsFilters };

/**
 * Gets analytics data for the current user's organization.
 */
export async function getAnalyticsData(filters: AnalyticsFilters = {}) {
  const timeRange = filters.timeRange ?? "daily";
  const response = await analyticsApi.getOverview(timeRange);
  return {
    filters: {
      startDate: filters.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: filters.endDate ?? new Date(),
      granularity: filters.granularity ?? "day",
    },
    ...response.data,
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof getAnalyticsData>>;
