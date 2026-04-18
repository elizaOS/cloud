import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  getHostedBrowserSnapshot,
  logHostedBrowserFailure,
} from "@/lib/services/browser-tools";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function handleGET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await context.params;
    const snapshot = await getHostedBrowserSnapshot(id, {
      apiKeyId: authResult.apiKey?.id ?? null,
      organizationId: authResult.user.organization_id,
      requestSource: "api",
      userId: authResult.user.id,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    logHostedBrowserFailure("browser_snapshot", error);
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
