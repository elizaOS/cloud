import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { referralsService } from "@/lib/services/referrals";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/v1/miniapp/referral/qualify
 * 
 * Called when a user links a social account (Farcaster, Twitter, wallet).
 * Awards the referrer their qualified bonus if the user was referred.
 * Note: Qualified bonus always goes to referrer's org balance (they're an app creator).
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const result = await referralsService.checkAndQualifyReferral(user.id);

    if (result.qualified) {
      logger.info("[Referral Qualify] User referral qualified", {
        userId: user.id,
        bonusAwarded: result.bonusAwarded,
      });
    }

    const response = NextResponse.json({
      success: true,
      qualified: result.qualified,
      bonusAwarded: result.bonusAwarded,
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Referral Qualify] Error qualifying referral", { error });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to qualify referral" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

