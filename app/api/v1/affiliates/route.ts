import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
import { getCorsHeaders } from "@/lib/utils/cors"; // Using shared CORS utility
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
 * Retrieves the current user's affiliate code if it exists.
 * Returns { code: null } if no code exists — use PUT to create one.
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
  markupPercent: z.number().min(0).max(200), // Capped at 200% to prevent excessive markups
});

/**
 * PUT /api/v1/affiliates
 * Updates or creates the current user's affiliate code with a specific markup.
 */
export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validation = MarkupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid markup. Must be a number between 0 and 200." },
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
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    logger.error("[Affiliates API] Error updating markup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
