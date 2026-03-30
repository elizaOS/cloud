/**
 * Authenticated "my referral code" endpoint for dashboard clients.
 *
 * WHY GET (not POST) for creation: One idempotent read that ensures `referral_codes` has a row—no
 * separate "create" step in the UI. Duplicate calls from header + Affiliates page are safe.
 *
 * WHY flat JSON (`ReferralMeResponse`): Nested `{ code: { code } }` shapes confuse parsers and
 * low-context clients; the share URL is always built client-side with `encodeURIComponent`.
 *
 * WHY `force-dynamic`: This handler may insert on first hit; caching would be wrong.
 *
 * WHY `ForbiddenError` before `isAuthError`: Auth errors return 401; missing org / feature gate
 * returns 403 with a clear message instead of masking as 500.
 */
import { type NextRequest, NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { referralsService } from "@/lib/services/referrals";
import type { ReferralMeResponse } from "@/lib/types/referral-me";
import { getCorsHeaders } from "@/lib/utils/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/** WHY broad message match: Session + API key auth throw varied `AuthenticationError` messages; all should map to 401 for this route. */
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

/**
 * GET /api/v1/referrals
 * Returns the current user's referral code (creates one if missing).
 */
async function handleGET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const row = await referralsService.getOrCreateCode(user.id);

    const totalReferrals =
      typeof row.total_referrals === "number"
        ? row.total_referrals
        : Number(row.total_referrals);

    const body: ReferralMeResponse = {
      code: row.code,
      total_referrals: Number.isFinite(totalReferrals) ? totalReferrals : 0,
      is_active: row.is_active,
    };

    return NextResponse.json(body, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403, headers: corsHeaders });
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    logger.error("[Referrals API] Error getting referral code", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
