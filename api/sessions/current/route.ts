import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { userSessionsService } from "@/lib/services/user-sessions";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/sessions/current
 * Gets statistics for the current user session.
 * Returns credits used, requests made, and tokens consumed for the active session.
 *
 * @returns JSON response with session statistics.
 */
async function handleGET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const stats = await userSessionsService.getCurrentSessionStats(user.id);

    if (!stats) {
      return NextResponse.json({
        success: true,
        data: {
          credits_used: 0,
          requests_made: 0,
          tokens_consumed: 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        credits_used: stats.credits_used,
        requests_made: stats.requests_made,
        tokens_consumed: stats.tokens_consumed,
      },
    });
  } catch (error) {
    logger.error("Error fetching current session stats:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch session stats",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
