import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { executeHostedGoogleSearch } from "@/lib/services/google-search";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  maxResults: z.number().int().min(1).max(10).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  source: z.string().trim().min(1).max(255).optional(),
  topic: z.enum(["general", "finance"]).optional(),
  timeRange: z.enum(["day", "week", "month", "year", "d", "w", "m", "y"]).optional(),
  startDate: z.string().trim().min(1).max(32).optional(),
  endDate: z.string().trim().min(1).max(32).optional(),
});

async function handlePOST(req: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);
    const bodyResult = searchRequestSchema.safeParse(await req.json());

    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid search request",
          details: bodyResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const body = bodyResult.data;
    const result = await executeHostedGoogleSearch(
      {
        query: body.query,
        maxResults: body.maxResults,
        model: body.model,
        source: body.source,
        topic: body.topic,
        timeRange: body.timeRange,
        startDate: body.startDate,
        endDate: body.endDate,
      },
      {
        organizationId: authResult.user.organization_id,
        userId: authResult.user.id,
        apiKeyId: authResult.apiKey?.id ?? null,
        requestSource: "api",
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[/api/v1/search] Request failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: getSafeErrorMessage(error),
      },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
