/**
 * App Analytics Service
 * 
 * Handles tracking and aggregation of app usage analytics
 */

import { appsRepository, type AppAnalytics, type NewAppAnalytics } from "@/db/repositories/apps";
import { usageRecordsRepository } from "@/db/repositories/usage-records";
import { logger } from "@/lib/utils/logger";

export class AppAnalyticsService {
  /**
   * Track a request for an app
   * This should be called whenever an app makes an API request
   */
  async trackRequest(params: {
    appId: string;
    userId?: string;
    requestType: "chat" | "image" | "video" | "voice" | "agent" | "embedding";
    success: boolean;
    inputTokens?: number;
    outputTokens?: number;
    cost?: string;
    creditsUsed?: string;
    responseTimeMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const {
        appId,
        userId,
        requestType,
        success,
        inputTokens = 0,
        outputTokens = 0,
        cost = "0.00",
        creditsUsed = "0.00",
        responseTimeMs,
        metadata,
      } = params;

      // Track app usage
      await appsRepository.incrementUsage(appId, creditsUsed);

      // Track app user activity if userId is provided
      if (userId) {
        await appsRepository.trackAppUserActivity(
          appId,
          userId,
          creditsUsed,
          metadata
        );
      }

      logger.info("Tracked app request", {
        appId,
        userId,
        requestType,
        success,
        creditsUsed,
      });
    } catch (error) {
      logger.error("Failed to track app request:", error);
      // Don't throw - tracking failures shouldn't break the main flow
    }
  }

  /**
   * Aggregate analytics for a time period
   * This should be run periodically (e.g., hourly, daily) to create analytics snapshots
   */
  async aggregateAnalytics(
    appId: string,
    periodStart: Date,
    periodEnd: Date,
    periodType: "hourly" | "daily" | "monthly"
  ): Promise<void> {
    try {
      // Get all usage records for this app in the period
      // This requires querying usage_records by app_id (we need to add this)
      
      // For now, we'll create a placeholder analytics record
      // In production, you'd query actual usage data
      
      const analyticsData: NewAppAnalytics = {
        app_id: appId,
        period_start: periodStart,
        period_end: periodEnd,
        period_type: periodType,
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        unique_users: 0,
        new_users: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost: "0.00",
        total_credits_used: "0.00",
        chat_requests: 0,
        image_requests: 0,
        video_requests: 0,
        voice_requests: 0,
        agent_requests: 0,
        avg_response_time_ms: null,
      };

      await appsRepository.createAnalytics(analyticsData);

      logger.info("Aggregated analytics for app", {
        appId,
        periodStart,
        periodEnd,
        periodType,
      });
    } catch (error) {
      logger.error("Failed to aggregate analytics:", error);
      throw error;
    }
  }

  /**
   * Calculate pricing for app usage
   * Takes into account custom pricing markup if enabled
   */
  calculateAppPricing(params: {
    baseCost: number;
    app: any;
  }): {
    baseCost: number;
    markup: number;
    finalCost: number;
    markupPercentage: number;
  } {
    const { baseCost, app } = params;

    if (!app.custom_pricing_enabled) {
      return {
        baseCost,
        markup: 0,
        finalCost: baseCost,
        markupPercentage: 0,
      };
    }

    const markupPercentage = parseFloat(app.custom_pricing_markup || "0");
    const markup = baseCost * (markupPercentage / 100);
    const finalCost = baseCost + markup;

    return {
      baseCost,
      markup,
      finalCost,
      markupPercentage,
    };
  }

  /**
   * Get app usage summary
   */
  async getAppUsageSummary(appId: string, days: number = 30): Promise<{
    totalRequests: number;
    totalUsers: number;
    totalCost: string;
    avgRequestsPerDay: number;
    avgCostPerDay: string;
  }> {
    const app = await appsRepository.findById(appId);
    
    if (!app) {
      throw new Error("App not found");
    }

    const avgRequestsPerDay = Math.round(app.total_requests / days);
    const totalCostNum = parseFloat(app.total_credits_used);
    const avgCostPerDay = (totalCostNum / days).toFixed(2);

    return {
      totalRequests: app.total_requests,
      totalUsers: app.total_users,
      totalCost: app.total_credits_used,
      avgRequestsPerDay,
      avgCostPerDay,
    };
  }
}

// Export singleton instance
export const appAnalyticsService = new AppAnalyticsService();

