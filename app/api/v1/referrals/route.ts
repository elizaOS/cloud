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
 * WHY `ForbiddenError` before auth mapping: Missing org / feature gate returns 403 instead of 500.
 *
 * REST note — GET performs `getOrCreateCode` (may INSERT): This intentionally trades strict
 * HTTP safety for one round-trip UX. Callers must be authenticated and rate-limited; we do not
 * rely on CDN cache. Automated clients with a valid session could create a row; risk is bounded
 * by auth + `referral_codes` unique(user_id). A stricter design would be POST to create + GET read-only.
 */
import { type NextRequest, NextResponse } from "next/server";
import { AuthenticationError, ForbiddenError, getErrorStatusCode } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { referralsService } from "@/lib/services/referrals";
import { coerceNonNegativeIntegerCount, type ReferralMeResponse } from "@/lib/types/referral-me";
import { getCorsHeaders } from "@/lib/utils/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Known wallet authentication failure message patterns.
 * Note: These string patterns are fragile—if wallet auth error messages change upstream,
 * this will incorrectly return 500 instead of 401. Track as technical debt.
 */
const WALLET_AUTH_FAILURE_PATTERNS = [
  "Invalid wallet signature",
  "Wallet authentication failed",
] as const;

/**
 * Checks if error indicates wallet authentication failure via message patterns.
 * Used to convert untyped wallet errors to {@link AuthenticationError}.
 */
function isWalletAuthFailure(error: Error): boolean {
  return WALLET_AUTH_FAILURE_PATTERNS.some((pattern) => error.message.includes(pattern));
}

/**
 * Wraps auth call and converts known wallet auth failures to typed {@link AuthenticationError}.
 * This contains the fragile message-matching in one place and ensures downstream code
 * only needs to check for typed errors.
 */
async function requireAuthWithTypedErrors(request: NextRequest) {
  try {
    return await requireAuthOrApiKeyWithOrg(request);
  } catch (error) {
    // Convert wallet auth failures to typed AuthenticationError
    if (error instanceof Error && isWalletAuthFailure(error)) {
      throw new AuthenticationError(error.message);
    }
    throw error;
  }
}

/**
 * Maps thrown errors to "treat as 401" for this route.
 * Uses {@link AuthenticationError} for auth failures, then `getErrorStatusCode` for other
 * `ApiError` shapes with 401 status.
 */
function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof AuthenticationError) return true;
  if (getErrorStatusCode(error) === 401) return true;
  return false;
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
    const { user } = await requireAuthWithTypedErrors(request);
    const row = await referralsService.getOrCreateCode(user.id);

    if (row == null || typeof row !== "object") {
      throw new Error("Referrals API: getOrCreateCode returned no referral row");
    }
    if (typeof row.code !== "string" || row.code.length === 0) {
      throw new Error("Referrals API: referral row missing code");
    }
    if (typeof row.is_active !== "boolean") {
      throw new Error("Referrals API: referral row missing is_active");
    }

    const totalReferrals = coerceNonNegativeIntegerCount(row.total_referrals);
    if (totalReferrals === null) {
      throw new Error(
        `Referrals API: total_referrals is not a valid non-negative integer (row.total_referrals=${String(row.total_referrals)})`,
      );
    }

    const body: ReferralMeResponse = {
      code: row.code,
      total_referrals: totalReferrals,
      is_active: row.is_active,
    };

    return NextResponse.json(body, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403, headers: corsHeaders });
    }

    if (isUnauthorizedError(error)) {
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
