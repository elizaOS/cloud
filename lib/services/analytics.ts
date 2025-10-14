/**
 * Analytics Service
 * Provides high-level analytics and reporting functions
 * Uses the usage-records repository for all data access
 */

import { usageRecordsRepository } from "@/db/repositories/usage-records";

// Re-export types
export type {
  TimeGranularity,
  UsageStats,
  TimeSeriesDataPoint,
  UserUsageBreakdown,
  CostTrending,
  ProviderBreakdown,
  ModelBreakdown,
  TrendData,
  CostBreakdownItem,
} from "@/db/repositories/usage-records";

export class AnalyticsService {
  async getUsageStats(
    organizationId: string,
    options?: { startDate?: Date; endDate?: Date },
  ) {
    return await usageRecordsRepository.getStatsByOrganization(
      organizationId,
      options?.startDate,
      options?.endDate,
    );
  }

  async getUsageTimeSeries(
    organizationId: string,
    options: {
      startDate: Date;
      endDate: Date;
      granularity: "hour" | "day" | "week" | "month";
    },
  ) {
    return await usageRecordsRepository.getUsageTimeSeries(
      organizationId,
      options,
    );
  }

  async getUsageByUser(
    organizationId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ) {
    return await usageRecordsRepository.getUsageByUser(organizationId, options);
  }

  async getCostTrending(organizationId: string) {
    return await usageRecordsRepository.getCostTrending(organizationId);
  }

  async getProviderBreakdown(
    organizationId: string,
    options?: { startDate?: Date; endDate?: Date },
  ) {
    return await usageRecordsRepository.getProviderBreakdown(
      organizationId,
      options,
    );
  }

  async getModelBreakdown(
    organizationId: string,
    options?: { startDate?: Date; endDate?: Date; limit?: number },
  ) {
    return await usageRecordsRepository.getModelBreakdown(
      organizationId,
      options,
    );
  }

  async getTrendData(
    organizationId: string,
    currentPeriod: { startDate: Date; endDate: Date },
    previousPeriod: { startDate: Date; endDate: Date },
  ) {
    return await usageRecordsRepository.getTrendData(
      organizationId,
      currentPeriod,
      previousPeriod,
    );
  }

  async getCostBreakdown(
    organizationId: string,
    dimension: "model" | "provider" | "user" | "apiKey",
    options?: {
      startDate?: Date;
      endDate?: Date;
      sortBy?: "cost" | "requests" | "tokens";
      sortOrder?: "asc" | "desc";
      limit?: number;
      offset?: number;
    },
  ) {
    return await usageRecordsRepository.getCostBreakdown(
      organizationId,
      dimension,
      options,
    );
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Export individual functions for backward compatibility with existing code
// These delegate to the service instance
export const getUsageStats = (
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date },
) => analyticsService.getUsageStats(organizationId, options);

export const getUsageStatsSafe = getUsageStats; // Alias for backward compatibility

export const getUsageTimeSeries = (
  organizationId: string,
  options: {
    startDate: Date;
    endDate: Date;
    granularity: "hour" | "day" | "week" | "month";
  },
) => analyticsService.getUsageTimeSeries(organizationId, options);

export const getUsageByUser = (
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  },
) => analyticsService.getUsageByUser(organizationId, options);

export const getCostTrending = (organizationId: string) =>
  analyticsService.getCostTrending(organizationId);

export const getProviderBreakdown = (
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date },
) => analyticsService.getProviderBreakdown(organizationId, options);

export const getModelBreakdown = (
  organizationId: string,
  options?: { startDate?: Date; endDate?: Date; limit?: number },
) => analyticsService.getModelBreakdown(organizationId, options);

export const getTrendData = (
  organizationId: string,
  currentPeriod: { startDate: Date; endDate: Date },
  previousPeriod: { startDate: Date; endDate: Date },
) =>
  analyticsService.getTrendData(organizationId, currentPeriod, previousPeriod);

export const getCostBreakdown = (
  organizationId: string,
  dimension: "model" | "provider" | "user" | "apiKey",
  options?: {
    startDate?: Date;
    endDate?: Date;
    sortBy?: "cost" | "requests" | "tokens";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  },
) => analyticsService.getCostBreakdown(organizationId, dimension, options);

// Validation helper for granularity
export function validateGranularity(
  value: string,
): value is "hour" | "day" | "week" | "month" {
  return ["hour", "day", "week", "month"].includes(value);
}
