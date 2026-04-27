import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  createHostedBrowserSession,
  listHostedBrowserSessions,
  logHostedBrowserFailure,
} from "@/lib/services/browser-tools";

const createSessionSchema = z.object({
  activityTtl: z.number().int().min(10).max(3600).optional(),
  show: z.boolean().optional(),
  title: z.string().trim().min(1).max(255).optional(),
  ttl: z.number().int().min(30).max(3600).optional(),
  url: z.string().trim().url().max(2_000).optional(),
});

async function handleGET(request: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const sessions = await listHostedBrowserSessions({
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    logHostedBrowserFailure("browser_list", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const bodyResult = createSessionSchema.safeParse(await request.json());
    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: "Invalid browser session request",
          details: bodyResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const session = await createHostedBrowserSession(bodyResult.data, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });
    return NextResponse.json({ session });
  } catch (error) {
    logHostedBrowserFailure("browser_create", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
