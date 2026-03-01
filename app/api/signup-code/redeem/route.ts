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
  const user = await requireAuthWithOrg();
  const organizationId = user.organization_id!;

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json(
      { error: "code is required (query param)" },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  try {
    const bonus = await redeemSignupCode(organizationId, code);
    return NextResponse.json(
      {
        success: true,
        bonus,
        message: `Added $${bonus} in bonus credits`,
      },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Invalid signup code") {
        return NextResponse.json(
          { error: "Invalid signup code" },
          { status: 400, headers: NO_CACHE_HEADERS },
        );
      }
      if (error.message === "Your account has already used a signup code") {
        return NextResponse.json(
          { error: "Your account has already used a signup code" },
          { status: 409, headers: NO_CACHE_HEADERS },
        );
      }
    }
    logger.error("[SignupCode Redeem] Error", { organizationId, error });
    return NextResponse.json(
      { error: "Failed to redeem code" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
