import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import {
  getUsageStatsSafe,
  getUsageTimeSeries,
  getProviderBreakdown,
  getModelBreakdown,
  getTrendData,
  type TimeGranularity,
} from "@/lib/services";

export const maxDuration = 60;

async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const timeRange =
      (searchParams.get("timeRange") as "daily" | "weekly" | "monthly") ||
      "daily";

    const cacheKey = CacheKeys.analytics.overview(
      user.organization_id,
      timeRange,
    );
    const cached = await cache.get<typeof response>(cacheKey);
    if (cached) {
      logger.debug(
        `[Analytics Overview] Cache hit for org=${user.organization_id}, range=${timeRange}`,
      );
      return NextResponse.json(cached);
    }

    const now = new Date();
    let startDate: Date;
    const endDate: Date = now;
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

    let previousStartDate: Date;
    let previousEndDate: Date;

    switch (timeRange) {
      case "daily":
        previousStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        previousEndDate = startDate;
        break;
      case "weekly":
        previousStartDate = new Date(
          startDate.getTime() - 7 * 24 * 60 * 60 * 1000,
        );
        previousEndDate = startDate;
        break;
      case "monthly":
        previousStartDate = new Date(
          startDate.getTime() - 30 * 24 * 60 * 60 * 1000,
        );
        previousEndDate = startDate;
        break;
      default:
        previousStartDate = new Date(
          startDate.getTime() - 7 * 24 * 60 * 60 * 1000,
        );
        previousEndDate = startDate;
    }

    const [summary, timeSeries, providerBreakdown, modelBreakdown, trends] =
      await Promise.all([
        getUsageStatsSafe(user.organization_id, { startDate, endDate }),
        getUsageTimeSeries(user.organization_id, {
          startDate,
          endDate,
          granularity,
        }),
        getProviderBreakdown(user.organization_id, { startDate, endDate }),
        getModelBreakdown(user.organization_id, {
          startDate,
          endDate,
          limit: 20,
        }),
        getTrendData(
          user.organization_id,
          { startDate, endDate },
          { startDate: previousStartDate, endDate: previousEndDate },
        ),
      ]);

    const response = {
      success: true,
      data: {
        timeSeries: timeSeries.map((point) => ({
          date: point.timestamp.toISOString().split("T")[0],
          requests: point.totalRequests,
          cost: point.totalCost,
          tokens: point.inputTokens + point.outputTokens,
        })),
        providerBreakdown: providerBreakdown.map((provider) => ({
          provider: provider.provider,
          requests: provider.totalRequests,
          cost: provider.totalCost,
          tokens: provider.totalTokens,
          percentage: provider.percentage,
        })),
        modelBreakdown: modelBreakdown.map((model) => ({
          model: model.model,
          requests: model.totalRequests,
          cost: model.totalCost,
          tokens: model.totalTokens,
        })),
        summary: {
          totalRequests: summary.totalRequests,
          totalCost: summary.totalCost,
          totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
          successRate: summary.successRate,
          avgCostPerRequest:
            summary.totalRequests > 0
              ? summary.totalCost / summary.totalRequests
              : 0,
          avgLatency: 0,
          activeApiKeys: 0,
        },
        trends: {
          requestsChange: trends.requestsChange,
          costChange: trends.costChange,
          tokensChange: trends.tokensChange,
          successRateChange: trends.successRateChange,
          period: trends.period,
        },
      },
    };

    const ttl = CacheTTL.analytics.overview[timeRange];
    await cache.set(cacheKey, response, ttl);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("[Analytics Overview] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch analytics",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
