import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Wallet-Address, X-Wallet-Signature, X-Timestamp",
    "Vary": "Origin"
  };
}
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
 */
export async function GET(request: NextRequest) {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    try {
        const { user } = await requireAuthOrApiKeyWithOrg(request);
        const code = await affiliatesService.getOrCreateAffiliateCode(user.id);

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

        logger.error("[Affiliates API] Error getting code:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}

const MarkupSchema = z.object({
    markupPercent: z.number().min(0).max(1000),
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
                { error: "Invalid markup. Must be a number between 0 and 1000." },
                { status: 400, headers: corsHeaders }
            );
        }

        const { markupPercent } = validation.data;
        const code = await affiliatesService.getOrCreateAffiliateCode(user.id, markupPercent);

        return NextResponse.json(
            { code },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        if (error?.message?.includes("Unauthorized")) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: corsHeaders }
            );
        }

        logger.error("[Affiliates API] Error updating markup:", error);
        return NextResponse.json(
            { error: error?.message || "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}
