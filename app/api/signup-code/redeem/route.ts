import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { redeemSignupCode, ERRORS } from "@/lib/services/signup-code";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

/* WHY no-cache: Prevents CDN/browser from caching 200 and hiding 409 (already used) on retry. */
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

/**
 * POST /api/signup-code/redeem
 * Redeem a signup code for the current user's organization (one-time bonus credits).
 * Auth: session only (no API key). WHY: Redemption is a one-time user action; API keys would let scripts burn codes.
 * Rate limit: CRITICAL. WHY: Redeem grants credits; strict limit reduces brute-force and abuse.
 * See docs/signup-codes.md for full WHYs.
 */
async function handlePOST(request: NextRequest) {
  try {
    let user;
    try {
      // Note: Intentionally using session-only auth (no request param) to prevent API key abuse for code redemption
      user = await requireAuthWithOrg(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: message },
        { status: 401, headers: NO_CACHE_HEADERS },
      );
    }

    const organizationId = user.organization_id!;
    const body = await request.json();
    const bodySchema = z.object({
      code: z.string().min(1).trim()
    });
    const result = bodySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "code is required in request body" },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    const bonus = await redeemSignupCode(organizationId, result.data.code);
    return NextResponse.json(
      {
        success: true,
        bonus,
        message: `Added $${Number(bonus).toFixed(2)} in bonus credits`,
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === ERRORS.INVALID_CODE) {
        return NextResponse.json(
          { error: ERRORS.INVALID_CODE },
          { status: 400, headers: NO_CACHE_HEADERS },
        );
      }
      if (error.message === ERRORS.ALREADY_USED) {
        return NextResponse.json(
          { error: ERRORS.ALREADY_USED },
          { status: 409, headers: NO_CACHE_HEADERS },
        );
      }
    }

    logger.error("[SignupCode Redeem] Error", { error });
    return NextResponse.json(
      { error: "Failed to redeem code" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

/* WHY CRITICAL: Redeem grants credits; strict rate limit (e.g. 5/5min) reduces abuse. */
export const POST = withRateLimit(handlePOST, RateLimitPresets.CRITICAL);

