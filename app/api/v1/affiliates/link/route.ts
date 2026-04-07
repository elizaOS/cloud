import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { ERRORS as AFFILIATE_ERRORS, affiliatesService } from "@/lib/services/affiliates";
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
        { status: 400, headers: corsHeaders },
      );
    }

    const link = await affiliatesService.linkUserToAffiliateCode(user.id, validation.data.code);

    return NextResponse.json({ success: true, link }, { headers: corsHeaders });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (
        error.message === AFFILIATE_ERRORS.INVALID_CODE ||
        error.message === AFFILIATE_ERRORS.CODE_NOT_FOUND
      ) {
        return NextResponse.json({ error: error.message }, { status: 404, headers: corsHeaders });
      }

      if (error.message === AFFILIATE_ERRORS.SELF_REFERRAL) {
        return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
      }

      if (error.message === AFFILIATE_ERRORS.ALREADY_LINKED) {
        return NextResponse.json({ error: error.message }, { status: 409, headers: corsHeaders });
      }
    }

    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Affiliates Link] Error linking user to affiliate code", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
  }
}, RateLimitPresets.STRICT);
