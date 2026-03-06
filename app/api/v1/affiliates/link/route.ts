import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { affiliatesService } from "@/lib/services/affiliates";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { getCorsHeaders } from "@/lib/utils/cors";
import { withRateLimit, RateLimitPresets } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
export const POST = withRateLimit(async function POST(request: NextRequest) {
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
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error("[Affiliates Link] Error linking user to affiliate code", {
            error: errorMessage,
        });

        // Use service-level error constants for consistent messaging
        const { AFFILIATE_ERRORS } = affiliatesService;
        
        // Check for specific error types from service
        if (error instanceof Error) {
            // Standard error codes that match repository-level errors
            if (error.message === AFFILIATE_ERRORS.INVALID_CODE || 
                error.message === AFFILIATE_ERRORS.CODE_NOT_FOUND) {
                return NextResponse.json(
                    { error: error.message },
                    { status: 404, headers: corsHeaders }
                );
            }
        }

        return NextResponse.json(
            { error: "Failed to link affiliate code" },
            { status: 500, headers: corsHeaders }
        );
    }
}, RateLimitPresets.STRICT);
