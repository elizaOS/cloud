import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { extractHostedPage, logHostedBrowserFailure } from "@/lib/services/browser-tools";

const extractRequestSchema = z.object({
  formats: z
    .array(z.enum(["html", "links", "markdown", "screenshot"]))
    .max(4)
    .optional(),
  onlyMainContent: z.boolean().optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  url: z.string().trim().url().max(2_000),
  waitFor: z.number().int().min(0).max(120_000).optional(),
});

async function handlePOST(request: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const bodyResult = extractRequestSchema.safeParse(await request.json());

    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid extract request",
          details: bodyResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await extractHostedPage(bodyResult.data, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    logHostedBrowserFailure("extract_page", error);
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error),
      },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
