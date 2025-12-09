import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { cookies } from "next/headers";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import { userSessionsService } from "@/lib/services/user-sessions";

/**
 * POST /api/auth/logout
 * Logs out the current user by ending all sessions and clearing auth cookies.
 *
 * @param req - The Next.js request object.
 * @returns JSON response indicating success or failure.
 */
async function handlePOST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (user) {
      await userSessionsService.endAllUserSessions(user.id);
    }

    const cookieStore = await cookies();

    cookieStore.delete("privy-token");
    cookieStore.delete("privy-refresh-token");
    cookieStore.delete("privy-id-token");
    cookieStore.delete("eliza-anon-session");

    return NextResponse.json(
      {
        success: true,
        message: "Logged out successfully",
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error during logout:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to logout",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
