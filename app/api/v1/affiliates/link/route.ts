import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

// CORS headers
function getCorsHeaders(origin: string | null) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
    };
}

export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get("origin");
    return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(origin),
    });
}

const LinkSchema = z.object({
    code: z.string().min(1),
});

/**
 * POST /api/v1/affiliates/link
 * Links the current user to a referring affiliate code.
 */
export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    try {
        const { user } = await requireAuthOrApiKeyWithOrg(request);

        const body = await request.json();
        const validation = LinkSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid affiliate code format." },
                { status: 400, headers: corsHeaders }
            );
        }

        const link = await affiliatesService.linkUserToAffiliateCode(user.id, validation.data.code);

        return NextResponse.json(
            { success: true, link },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        if (error?.message?.includes("Unauthorized")) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: corsHeaders }
            );
        }

        if (error?.message?.includes("already linked") || error?.message?.includes("cannot refer themselves") || error?.message?.includes("Invalid affiliate")) {
            return NextResponse.json(
                { error: error.message },
                { status: 400, headers: corsHeaders }
            );
        }

        logger.error("[Affiliates Link API] Error linking user:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}
