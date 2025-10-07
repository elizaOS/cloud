import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getUsageTimeSeries,
  getUsageByUser,
  type TimeGranularity,
} from "@/lib/queries/analytics";
import {
  generateCSV,
  generateJSON,
  createDownloadResponse,
} from "@/lib/export/analytics";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const format = searchParams.get("format") || "csv";
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();
    const granularity =
      (searchParams.get("granularity") as TimeGranularity) || "day";
    const dataType = searchParams.get("type") || "timeseries";

    let data: Array<Record<string, unknown>>;
    let filename: string;

    if (dataType === "users") {
      const userBreakdown = await getUsageByUser(user.organization_id, {
        startDate,
        endDate,
      });
      data = userBreakdown.map((u) => ({
        email: u.userEmail,
        name: u.userName || "Unknown",
        requests: u.totalRequests,
        cost: u.totalCost,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        lastActive: u.lastActive?.toISOString() || "",
      }));
      filename = `user-analytics-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
    } else {
      const timeSeriesData = await getUsageTimeSeries(user.organization_id, {
        startDate,
        endDate,
        granularity,
      });
      data = timeSeriesData.map((point) => ({
        timestamp: point.timestamp.toISOString(),
        requests: point.totalRequests,
        cost: point.totalCost,
        inputTokens: point.inputTokens,
        outputTokens: point.outputTokens,
        successRate: point.successRate.toFixed(4),
      }));
      filename = `usage-analytics-${granularity}-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
    }

    if (format === "json") {
      return createDownloadResponse(
        generateJSON(data),
        `${filename}.json`,
        "application/json"
      );
    }

    const columns = Object.keys(data[0] || {}).map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
    }));

    return createDownloadResponse(
      generateCSV(data, columns),
      `${filename}.csv`,
      "text/csv"
    );
  } catch (error) {
    console.error("[Analytics Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export analytics data" },
      { status: 500 }
    );
  }
}
