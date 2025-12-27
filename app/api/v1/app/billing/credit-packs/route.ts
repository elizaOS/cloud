import { NextRequest, NextResponse } from "next/server";
import { creditsService } from "@/lib/services/credits";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkAppRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  APP_RATE_LIMITS,
} from "@/lib/middleware/app-rate-limit";
import { logger } from "@/lib/utils/logger";

/**
 * OPTIONS /api/v1/app/billing/credit-packs
 * CORS preflight handler for app credit packs endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/app/billing/credit-packs
 * Lists all active credit packs available for purchase.
 * Returns credit packs formatted for display in app billing UI.
 *
 * @param request - The Next.js request object.
 * @returns Array of active credit packs with pricing and bonus information.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkAppRateLimit(request, APP_RATE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const creditPacks = await creditsService.listActiveCreditPacks();

    // Transform to remove internal fields
    const packs = creditPacks.map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      credits: pack.credits,
      price: pack.price,
      bonusCredits: pack.bonus_credits,
      isPopular: pack.is_popular,
    }));

    const response = NextResponse.json({
      success: true,
      creditPacks: packs,
    });

    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App Billing] Error fetching credit packs", { error });

    const response = NextResponse.json(
      {
        success: false,
        error: "Failed to fetch credit packs",
      },
      { status: 500 },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
