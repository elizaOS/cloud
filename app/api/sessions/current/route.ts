import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { userSessionsService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handleGET() {
  try {
    const user = await requireAuthWithOrg();

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
    console.error("Error fetching current session stats:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch session stats",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
