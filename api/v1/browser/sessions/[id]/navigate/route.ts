import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  logHostedBrowserFailure,
  navigateHostedBrowserSession,
} from "@/lib/services/browser-tools";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const navigateSchema = z.object({
  url: z.string().trim().url().max(2_000),
});

async function handlePOST(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await context.params;
    const bodyResult = navigateSchema.safeParse(await request.json());
    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid navigate request",
          details: bodyResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const session = await navigateHostedBrowserSession(id, bodyResult.data.url, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });

    return NextResponse.json({ session });
  } catch (error) {
    logHostedBrowserFailure("browser_navigate", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
