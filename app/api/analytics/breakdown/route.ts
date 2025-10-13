import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { getCostBreakdown } from "@/lib/queries/analytics";

export const maxDuration = 60;

async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);
    const searchParams = req.nextUrl.searchParams;

    const dimension = (searchParams.get("dimension") ||
      "model") as "model" | "provider" | "user" | "apiKey";
    const sortBy = (searchParams.get("sortBy") || "cost") as
      | "cost"
      | "requests"
      | "tokens";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 1000); // Cap at 1000
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    const breakdown = await getCostBreakdown(
      user.organization_id,
      dimension,
      {
        startDate,
        endDate,
        sortBy,
        sortOrder,
        limit: limit + 1, // Fetch one extra to check if more exist
        offset,
      }
    );

    // Check if more results exist
    const hasMore = breakdown.length > limit;
    const results = hasMore ? breakdown.slice(0, limit) : breakdown;

    return NextResponse.json({
      success: true,
      data: results.map((item) => ({
        dimension: item.dimension,
        value: item.value,
        cost: item.cost,
        requests: item.requests,
        tokens: item.tokens,
        successCount: item.successCount,
        totalCount: item.totalCount,
        successRate:
          item.totalCount > 0 ? item.successCount / item.totalCount : 1.0,
      })),
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
    });
  } catch (error) {
    logger.error("[Analytics Breakdown] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch breakdown data",
      },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
