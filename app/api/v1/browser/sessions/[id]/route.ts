import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  deleteHostedBrowserSession,
  getHostedBrowserSession,
  logHostedBrowserFailure,
} from "@/lib/services/browser-tools";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function handleGET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await context.params;
    const session = await getHostedBrowserSession(id, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });
    return NextResponse.json({ session });
  } catch (error) {
    logHostedBrowserFailure("browser_get", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await context.params;
    const result = await deleteHostedBrowserSession(id, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });
    return NextResponse.json({
      closed: result.success === true,
      creditsBilled: result.creditsBilled ?? null,
      sessionDurationMs: result.sessionDurationMs ?? null,
    });
  } catch (error) {
    logHostedBrowserFailure("browser_delete", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);
