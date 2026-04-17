import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getErrorStatusCode,
  nextJsonFromCaughtErrorWithHeaders,
} from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { affiliatesService } from "@/lib/services/affiliates";
import { getCorsHeaders } from "@/lib/utils/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({ code: code ?? null }, { headers: corsHeaders });
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Affiliates API] Error getting code:", error);
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
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
        { status: 400, headers: corsHeaders },
      );
    }

    const { markupPercent } = validation.data;
    const code = await affiliatesService.updateMarkup(user.id, markupPercent);

    return NextResponse.json({ code }, { headers: corsHeaders });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Affiliate code not found")
    ) {
      return NextResponse.json(
        { error: "No affiliate code. Create one with POST first." },
        { status: 404, headers: corsHeaders },
      );
    }
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Affiliates API] Error updating markup:", error);
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
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
        { status: 400, headers: corsHeaders },
      );
    }

    const { markupPercent } = validation.data;
    const code = await affiliatesService.getOrCreateAffiliateCode(
      user.id,
      markupPercent,
    );

    return NextResponse.json({ code }, { headers: corsHeaders });
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Affiliates API] Error creating affiliate code:", error);
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
