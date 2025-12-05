/**
 * /api/v1/miniapp/billing/credit-packs
 *
 * GET - List available credit packs
 * Returns active credit packs for display in miniapp billing UI
 */

import { NextRequest, NextResponse } from "next/server";
import { creditsService } from "@/lib/services";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkMiniappRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(rateLimitResult, corsResult.origin ?? undefined);
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
    logger.error("[Miniapp Billing] Error fetching credit packs", { error });

    const response = NextResponse.json(
      {
        success: false,
        error: "Failed to fetch credit packs",
      },
      { status: 500 }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

