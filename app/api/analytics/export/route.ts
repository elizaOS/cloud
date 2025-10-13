import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getUsageTimeSeries,
  getUsageByUser,
  getProviderBreakdown,
  getModelBreakdown,
  type TimeGranularity,
} from "@/lib/services";
import {
  generateCSV,
  generateJSON,
  createDownloadResponse,
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatDate,
  type ExportColumn,
  type ExportOptions,
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
    const includeMetadata = searchParams.get("includeMetadata") === "true";

    const exportOptions: ExportOptions = {
      includeTimestamp: true,
      includeMetadata,
    };

    let data: Array<Record<string, unknown>>;
    let columns: ExportColumn[];
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
      columns = [
        { key: "email", label: "Email" },
        { key: "name", label: "Name" },
        { key: "requests", label: "Total Requests", format: formatNumber },
        { key: "cost", label: "Total Cost (Credits)", format: formatCurrency },
        { key: "inputTokens", label: "Input Tokens", format: formatNumber },
        { key: "outputTokens", label: "Output Tokens", format: formatNumber },
        { key: "lastActive", label: "Last Active", format: formatDate },
      ];
      filename = `user-analytics-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
    } else if (dataType === "providers") {
      const providerBreakdown = await getProviderBreakdown(
        user.organization_id,
        {
          startDate,
          endDate,
        }
      );
      data = providerBreakdown.map((p) => ({
        provider: p.provider,
        requests: p.totalRequests,
        cost: p.totalCost,
        tokens: p.totalTokens,
        successRate: p.successRate,
        percentage: p.percentage,
      }));
      columns = [
        { key: "provider", label: "Provider" },
        { key: "requests", label: "Total Requests", format: formatNumber },
        { key: "cost", label: "Total Cost (Credits)", format: formatCurrency },
        { key: "tokens", label: "Total Tokens", format: formatNumber },
        {
          key: "successRate",
          label: "Success Rate",
          format: formatPercentage,
        },
        {
          key: "percentage",
          label: "Usage %",
          format: (v) => `${Number(v).toFixed(1)}%`,
        },
      ];
      filename = `provider-analytics-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
    } else if (dataType === "models") {
      const modelBreakdown = await getModelBreakdown(user.organization_id, {
        startDate,
        endDate,
        limit: 100,
      });
      data = modelBreakdown.map((m) => ({
        model: m.model,
        provider: m.provider,
        requests: m.totalRequests,
        cost: m.totalCost,
        tokens: m.totalTokens,
        avgCostPerToken: m.avgCostPerToken,
        successRate: m.successRate,
      }));
      columns = [
        { key: "model", label: "Model" },
        { key: "provider", label: "Provider" },
        { key: "requests", label: "Total Requests", format: formatNumber },
        { key: "cost", label: "Total Cost (Credits)", format: formatCurrency },
        { key: "tokens", label: "Total Tokens", format: formatNumber },
        {
          key: "avgCostPerToken",
          label: "Avg Cost/Token",
          format: (v) => Number(v).toFixed(6),
        },
        {
          key: "successRate",
          label: "Success Rate",
          format: formatPercentage,
        },
      ];
      filename = `model-analytics-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
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
        successRate: point.successRate,
      }));
      columns = [
        { key: "timestamp", label: "Timestamp", format: formatDate },
        { key: "requests", label: "Total Requests", format: formatNumber },
        { key: "cost", label: "Total Cost (Credits)", format: formatCurrency },
        { key: "inputTokens", label: "Input Tokens", format: formatNumber },
        { key: "outputTokens", label: "Output Tokens", format: formatNumber },
        {
          key: "successRate",
          label: "Success Rate",
          format: formatPercentage,
        },
      ];
      filename = `usage-analytics-${granularity}-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}`;
    }

    if (format === "json") {
      return createDownloadResponse(
        generateJSON(data, exportOptions),
        `${filename}.json`,
        "application/json"
      );
    }

    if (format === "excel" || format === "xlsx") {
      return NextResponse.json(
        {
          error:
            "Excel export requires 'xlsx' package. Install with: bun add xlsx",
        },
        { status: 501 }
      );
    }

    if (format === "pdf") {
      return NextResponse.json(
        {
          error:
            "PDF export requires 'pdfkit' package. Install with: bun add pdfkit @types/pdfkit",
        },
        { status: 501 }
      );
    }

    return createDownloadResponse(
      generateCSV(data, columns, exportOptions),
      `${filename}.csv`,
      "text/csv"
    );
  } catch (error) {
    console.error("[Analytics Export] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to export analytics data",
      },
      { status: 500 }
    );
  }
}
