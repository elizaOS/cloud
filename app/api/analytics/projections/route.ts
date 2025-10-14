import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { getUsageTimeSeries, type TimeGranularity } from "@/lib/services";
import {
  generateProjections,
  generateProjectionAlerts,
} from "@/lib/analytics/projections";
import { organizationsService } from "@/lib/services";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const timeRange =
      (searchParams.get("timeRange") as "daily" | "weekly" | "monthly") ||
      "weekly";
    const periods = parseInt(searchParams.get("periods") || "7", 10);

    const now = new Date();
    let startDate: Date;
    let granularity: TimeGranularity;

    switch (timeRange) {
      case "daily":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        granularity = "day";
        break;
      case "weekly":
        startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
        granularity = "week";
        break;
      case "monthly":
        startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        granularity = "month";
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        granularity = "day";
    }

    const [historicalData, org] = await Promise.all([
      getUsageTimeSeries(user.organization_id, {
        startDate,
        endDate: now,
        granularity,
      }),
      organizationsService.getById(user.organization_id),
    ]);

    const projections = generateProjections(historicalData, periods);

    const alerts = generateProjectionAlerts(
      historicalData,
      projections,
      org?.credit_balance || 0,
    );

    return NextResponse.json({
      success: true,
      data: {
        historicalData: historicalData.map((point) => ({
          date: point.timestamp.toISOString().split("T")[0],
          requests: point.totalRequests,
          cost: point.totalCost,
          tokens: point.inputTokens + point.outputTokens,
        })),
        projections: projections.map((point) => ({
          date: point.timestamp.toISOString().split("T")[0],
          requests: point.totalRequests,
          cost: point.totalCost,
          tokens: point.inputTokens + point.outputTokens,
          isProjected: point.isProjected,
          confidence: point.confidence,
        })),
        alerts,
        metadata: {
          timeRange,
          periods,
          creditBalance: org?.credit_balance || 0,
        },
      },
    });
  } catch (error) {
    logger.error("[Analytics Projections] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate projections",
      },
      { status: 500 },
    );
  }
}
