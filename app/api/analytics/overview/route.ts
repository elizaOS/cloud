import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getUsageStatsSafe,
  getUsageTimeSeries,
  getProviderBreakdown,
  getModelBreakdown,
  getTrendData,
  type TimeGranularity,
} from "@/lib/queries/analytics";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const timeRange =
      (searchParams.get("timeRange") as "daily" | "weekly" | "monthly") ||
      "daily";

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

    let previousStartDate: Date;
    let previousEndDate: Date;

    switch (timeRange) {
      case "daily":
        previousStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        previousEndDate = startDate;
        break;
      case "weekly":
        previousStartDate = new Date(
          startDate.getTime() - 7 * 24 * 60 * 60 * 1000
        );
        previousEndDate = startDate;
        break;
      case "monthly":
        previousStartDate = new Date(
          startDate.getTime() - 30 * 24 * 60 * 60 * 1000
        );
        previousEndDate = startDate;
        break;
      default:
        previousStartDate = new Date(
          startDate.getTime() - 7 * 24 * 60 * 60 * 1000
        );
        previousEndDate = startDate;
    }

    const [
      summary,
      timeSeries,
      providerBreakdown,
      modelBreakdown,
      trends,
    ] = await Promise.all([
      getUsageStatsSafe(user.organization_id, { startDate, endDate }),
      getUsageTimeSeries(user.organization_id, {
        startDate,
        endDate,
        granularity,
      }),
      getProviderBreakdown(user.organization_id, { startDate, endDate }),
      getModelBreakdown(user.organization_id, { startDate, endDate, limit: 20 }),
      getTrendData(
        user.organization_id,
        { startDate, endDate },
        { startDate: previousStartDate, endDate: previousEndDate }
      ),
    ]);

    const response = {
      success: true,
      data: {
        timeSeries: timeSeries.map((point) => ({
          date: point.timestamp.toISOString().split("T")[0],
          requests: point.totalRequests,
          cost: point.totalCost,
          spent: point.totalCost,
          tokens: point.inputTokens + point.outputTokens,
        })),
        providerBreakdown: providerBreakdown.map((provider) => ({
          provider: provider.provider,
          name: provider.provider,
          requests: provider.totalRequests,
          cost: provider.totalCost,
          spent: provider.totalCost,
          tokens: provider.totalTokens,
          percentage: provider.percentage,
          marketShare: provider.percentage,
        })),
        modelBreakdown: modelBreakdown.map((model) => ({
          model: model.model,
          requests: model.totalRequests,
          cost: model.totalCost,
          spent: model.totalCost,
          tokens: model.totalTokens,
        })),
        summary: {
          totalRequests: summary.totalRequests,
          totalCost: summary.totalCost,
          totalSpent: summary.totalCost,
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
          spentChange: trends.costChange,
          tokensChange: trends.tokensChange,
          successRateChange: trends.successRateChange,
          period: trends.period,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Analytics Overview] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch analytics",
      },
      { status: 500 }
    );
  }
}
