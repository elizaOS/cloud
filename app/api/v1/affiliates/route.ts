import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
import { getCorsHeaders } from "@/lib/utils/cors";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("Unauthorized") ||
    msg.includes("Invalid wallet signature") ||
    msg.includes("Wallet authentication failed")
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
 * GET /api/v1/affiliates
 * Read-only: returns the current user's affiliate code if it exists.
 * Returns { code: null } when the user has no affiliate code (use POST to create).
 */
async function handleGET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const code = await affiliatesService.getAffiliateCode(user.id);

    return NextResponse.json(
      { code: code ?? null },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    logger.error("[Affiliates API] Error getting code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);

const MarkupSchema = z.object({
  markupPercent: z.number().min(0).max(1000),
});

/**
 * PUT /api/v1/affiliates
 * Updates the current user's affiliate code markup (code must already exist).
 */
async function handlePUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validation = MarkupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid markup. Must be a number between 0 and 1000%." },
        { status: 400, headers: corsHeaders }
      );
    }

    const { markupPercent } = validation.data;
    const code = await affiliatesService.updateMarkup(user.id, markupPercent);

    return NextResponse.json(
      { code },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }
    if (error instanceof Error && error.message.includes("Affiliate code not found")) {
      return NextResponse.json(
        { error: "No affiliate code. Create one with POST first." },
        { status: 404, headers: corsHeaders }
      );
    }

    logger.error("[Affiliates API] Error updating markup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const PUT = withRateLimit(handlePUT, RateLimitPresets.STANDARD);

/**
 * POST /api/v1/affiliates
 * Creates a new affiliate code for the user with specified markup.
 */
async function handlePOST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validation = MarkupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid markup. Must be a number between 0 and 1000%." },
        { status: 400, headers: corsHeaders }
      );
    }

    const { markupPercent } = validation.data;
    const code = await affiliatesService.getOrCreateAffiliateCode(user.id, markupPercent);

    return NextResponse.json(
      { code },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    logger.error("[Affiliates API] Error creating affiliate code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
