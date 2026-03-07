import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { referralsService } from "@/lib/services/referrals";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { getCorsHeaders } from "@/lib/utils/cors";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

export const dynamic = "force-dynamic";

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unauthorized") ||
    error.message.includes("Authentication required") ||
    error.message.includes("Invalid or expired token") ||
    error.message.includes("Invalid or expired API key") ||
    error.message.includes("Invalid wallet signature") ||
    error.message.includes("Wallet authentication failed")
  );
}

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

      return NextResponse.json(
        { error: result.message },
        { status, headers: corsHeaders },
      );
    }

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    logger.error("[Referral Apply] Error applying referral code", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Failed to apply referral code" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);
