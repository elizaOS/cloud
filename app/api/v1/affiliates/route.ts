import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
import { getCorsHeaders } from "@/lib/utils/cors";
import { z } from "zod";

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
 * Retrieves the current user's affiliate code without creating one.
 * Returns { code: null } if no code exists.
 */
export async function GET(request: NextRequest) {
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
    if (error instanceof Error && error.message.includes("Unauthorized")) {
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

const MarkupSchema = z.object({
  // Note: Max 200% markup to match database check constraint and avoid excessive pricing
  markupPercent: z.number().min(0).max(200),
});

/**
 * POST /api/v1/affiliates
 * Creates a new affiliate code for the user with specified markup.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validation = MarkupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid markup. Must be a number between 0 and 200%." },
        { status: 400, headers: corsHeaders }
      );
    }

    const { markupPercent } = validation.data;
    const code = await affiliatesService.createAffiliateCode(user.id, markupPercent);

    return NextResponse.json(
      { code },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
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
