import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { referralsService } from "@/lib/services/referrals";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const ApplyCodeSchema = z.object({
  code: z.string().min(1).max(20),
});

/**
 * OPTIONS /api/v1/app/referral/apply
 * CORS preflight handler for app referral code application endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

/**
 * POST /api/v1/app/referral/apply
 * Applies a referral code to the authenticated user's account.
 * Awards signup bonus to the user and tracks the referral relationship.
 * If X-App-Id header is present, credits go to app balance (for monetized apps).
 *
 * Request Body:
 * - `code`: Referral code to apply (required, 1-20 characters).
 *
 * @param request - Request body with referral code and optional X-App-Id header.
 * @returns Application result with bonus amount and success status.
 */
export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = ApplyCodeSchema.safeParse(body);

    if (!validationResult.success) {
      const response = NextResponse.json(
        { success: false, error: "Invalid referral code format" },
        { status: 400 }
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const { code } = validationResult.data;

    // Get appId from header - credits go to app balance if present
    const appId = request.headers.get("X-App-Id") || undefined;

    const result = await referralsService.applyReferralCode(
      user.id,
      user.organization_id,
      code,
      appId ? { appId } : undefined
    );

    const response = NextResponse.json({
      success: result.success,
      message: result.message,
      bonusAmount: result.bonusAmount,
    });

    if (!result.success) {
      return addCorsHeaders(
        NextResponse.json({ success: false, error: result.message }, { status: 400 }),
        corsResult.origin
      );
    }

    logger.info("[App Referral] Code applied", { userId: user.id, code, appId });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App Referral] Error applying referral code", { error });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to apply referral code" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

