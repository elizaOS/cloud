import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { referralsService } from "@/lib/services";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const ApplyCodeSchema = z.object({
  code: z.string().min(1).max(20),
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

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

    logger.info("[Miniapp Referral] Code applied", { userId: user.id, code, appId });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp Referral] Error applying referral code", { error });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to apply referral code" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

