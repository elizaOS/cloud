import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { referralsService, REWARDS } from "@/lib/services/referrals";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";

/**
 * OPTIONS /api/v1/miniapp/referral
 * CORS preflight handler for miniapp referral endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/referral
 * Gets the authenticated user's referral code and statistics.
 * Includes share URL, earnings breakdown, and reward rates.
 *
 * @param request - The Next.js request object.
 * @returns Referral code, share URL, statistics, and reward information.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const referralCode = await referralsService.getOrCreateCode(user.id);
    const stats = await referralsService.getReferralStats(user.id);

    // Build share URL - use Origin header for miniapp context, fallback to cloud URL
    const origin = request.headers.get("origin");
    const baseUrl =
      origin || process.env.NEXT_PUBLIC_APP_URL || "https://app.eliza.ai";
    const shareUrl = `${baseUrl}?ref=${referralCode.code}`;

    const response = NextResponse.json({
      success: true,
      referral: {
        code: referralCode.code,
        shareUrl,
        stats: {
          totalReferrals: stats.totalReferrals,
          totalEarnings: stats.totalEarnings,
          signupEarnings: stats.signupEarnings,
          qualifiedEarnings: stats.qualifiedEarnings,
          commissionEarnings: stats.commissionEarnings,
        },
        rewards: {
          signupBonus: REWARDS.SIGNUP_BONUS,
          referredBonus: REWARDS.REFERRED_BONUS,
          qualifiedBonus: REWARDS.QUALIFIED_BONUS,
          commissionRate: REWARDS.COMMISSION_RATE * 100,
        },
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp Referral] Error getting referral info", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get referral info",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
