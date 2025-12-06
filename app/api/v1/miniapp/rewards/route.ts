import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialRewardsService, referralsService, REWARDS } from "@/lib/services";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";

/**
 * OPTIONS /api/v1/miniapp/rewards
 * CORS preflight handler for miniapp rewards endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/rewards
 * Gets the authenticated user's rewards status including sharing and referral earnings.
 * Includes available rewards, claimed status, and reward rates for different platforms.
 *
 * @param request - The Next.js request object.
 * @returns Rewards status including sharing earnings, referral statistics, and reward rates.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const [shareStatus, referralStats, socialEarnings] = await Promise.all([
      socialRewardsService.getShareStatus(user.id),
      referralsService.getReferralStats(user.id),
      socialRewardsService.getTotalEarnings(user.id),
    ]);

    const response = NextResponse.json({
      success: true,
      rewards: {
        sharing: {
          status: shareStatus,
          totalEarnings: socialEarnings,
          availableToday: Object.entries(shareStatus)
            .filter(([_, v]) => !v.claimed)
            .reduce((sum, [_, v]) => sum + v.amount, 0),
        },
        referrals: {
          code: referralStats.code,
          totalReferrals: referralStats.totalReferrals,
          totalEarnings: referralStats.totalEarnings,
          signupEarnings: referralStats.signupEarnings,
          qualifiedEarnings: referralStats.qualifiedEarnings,
          commissionEarnings: referralStats.commissionEarnings,
        },
        rewardRates: {
          shareX: REWARDS.SHARE_X,
          shareFarcaster: REWARDS.SHARE_FARCASTER,
          shareTelegram: REWARDS.SHARE_TELEGRAM,
          shareDiscord: REWARDS.SHARE_DISCORD,
          signupBonus: REWARDS.SIGNUP_BONUS,
          referredBonus: REWARDS.REFERRED_BONUS,
          qualifiedBonus: REWARDS.QUALIFIED_BONUS,
          commissionRate: REWARDS.COMMISSION_RATE * 100,
        },
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp Rewards] Error getting rewards status", { error });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get rewards status" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

