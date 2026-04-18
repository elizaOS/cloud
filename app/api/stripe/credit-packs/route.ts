import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/stripe/credit-packs
 * Lists all active credit packs available for purchase.
 * Public endpoint - no authentication required.
 *
 * @returns Array of active credit packs with pricing and credit amounts.
 */
async function handleGET(_request: NextRequest) {
  try {
    const creditPacks = await creditsService.listActiveCreditPacks();
    return NextResponse.json({ creditPacks }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching credit packs:", error);
    return NextResponse.json({ error: "Failed to fetch credit packs" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
