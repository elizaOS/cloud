import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { redeemSignupCode } from "@/lib/services/signup-code";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";

/**
 * WHY no-cache: GET with side effects; prefetch or CDN cache could trigger redemption.
 * These headers discourage caching and accidental double-hit.
 */
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

/**
 * GET /api/signup-code/redeem?code=...
 *
 * Redeem a signup code for the current user's organization (one-time bonus credits).
 * WHY GET: Marketing/ads use links, not forms; one URL can land and redeem when user is logged in.
 * Auth: session only (requireAuthWithOrg). WHY not API key: redeem is a user action from the app.
 * See docs/signup-codes.md for design WHYs.
 */
async function handleGET(request: NextRequest) {
  try {
    // Move requireAuthWithOrg inside try/catch to properly handle auth errors
    let user;
    try {
      user = await requireAuthWithOrg();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: message },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }
    
    const organizationId = user.organization_id!;

    const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
    if (!code) {
      return NextResponse.json(
        { error: "code is required (query param)" },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }
    const bonus = await redeemSignupCode(organizationId, code);
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
      // Import error constants from service
      const { ERRORS } = await import("@/lib/services/signup-code");

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
      // Note: Authentication errors are now handled in the initial try/catch block
    }
    
    logger.error("[SignupCode Redeem] Error", { error });
    return NextResponse.json(
      { error: "Failed to redeem code" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.CRITICAL);
