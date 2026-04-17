/**
 * Admin Engagement Metrics API
 *
 * GET /api/v1/admin/metrics?view=overview|retention|daily&timeRange=7d|30d|90d
 *
 * Returns pre-computed and live engagement metrics for the admin dashboard.
 * Requires super_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { userMetricsService } from "@/lib/services/user-metrics";
import { logger } from "@/lib/utils/logger";

const TIME_RANGE_MS: Record<string, number> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

async function handleGetMetrics(request: NextRequest): Promise<NextResponse> {
  let auth;
  try {
    auth = await requireAdmin(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Admin access required";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (auth.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super_admin can access engagement metrics" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "overview";
  const timeRange = searchParams.get("timeRange") || "30d";

  const rangeMs = TIME_RANGE_MS[timeRange] ?? TIME_RANGE_MS["30d"];
  const rangeDays = Math.round(rangeMs / 86_400_000);
  const now = new Date();
  const startDate = new Date(now.getTime() - rangeMs);

  try {
    switch (view) {
      case "overview":
        return NextResponse.json(
          await userMetricsService.getMetricsOverview(rangeDays),
        );

      case "daily":
        return NextResponse.json(
          await userMetricsService.getDailyMetrics(startDate, now),
        );

      case "retention":
        return NextResponse.json(
          await userMetricsService.getRetentionCohorts(startDate, now),
        );

      case "active": {
        const activeRangeMap: Record<string, "day" | "7d" | "30d"> = {
          "7d": "7d",
          "30d": "30d",
          "90d": "30d",
        };
        const range = activeRangeMap[timeRange] ?? "day";
        return NextResponse.json(
          await userMetricsService.getActiveUsers(range),
        );
      }

      case "signups":
        return NextResponse.json(
          await userMetricsService.getNewSignups(startDate, now),
        );

      case "oauth":
        return NextResponse.json(
          await userMetricsService.getOAuthConnectionRate(),
        );

      default:
        return NextResponse.json(
          { error: "Unknown view parameter" },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[Admin Metrics API] Query failed", {
      view,
      timeRange,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGetMetrics, RateLimitPresets.STANDARD);
