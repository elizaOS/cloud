import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { referralsService } from "@/lib/services/referrals";
import { getCorsHeaders } from "@/lib/utils/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

const ApplySchema = z.object({
  code: z.string().min(1),
});

async function handlePOST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    if (!user.organization_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400, headers: corsHeaders },
      );
    }

    const body = await request.json();
    const validation = ApplySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid referral code format." },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await referralsService.applyReferralCode(
      user.id,
      user.organization_id,
      validation.data.code,
    );

    if (!result.success) {
      const status =
        result.message === "Invalid referral code"
          ? 404
          : result.message === "Already used a referral code"
            ? 409
            : 400;

      return NextResponse.json({ error: result.message }, { status, headers: corsHeaders });
    }

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Referral Apply] Error applying referral code", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);
