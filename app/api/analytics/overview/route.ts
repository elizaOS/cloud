import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { analyticsService } from "@/lib/services/analytics";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const maxDuration = 60;

async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const timeRange =
      (searchParams.get("timeRange") as "daily" | "weekly" | "monthly") ||
      "daily";

    const data = await analyticsService.getOverview(
      user.organization_id,
      timeRange,
    );

    return NextResponse.json({
      success: true,
      data,
    });
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
