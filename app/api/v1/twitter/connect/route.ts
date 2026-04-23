import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { cache } from "@/lib/cache/client";
import {
  getDefaultPlatformRedirectOrigins,
  LOOPBACK_REDIRECT_ORIGINS,
  resolveOAuthSuccessRedirectUrl,
} from "@/lib/security/redirect-validation";
import { twitterAutomationService } from "@/lib/services/twitter-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!twitterAutomationService.isConfigured()) {
    return NextResponse.json(
      { error: "Twitter integration is not configured on this platform" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const connectionRole = body.connectionRole === "agent" ? "agent" : "owner";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
  const defaultRedirectPath = "/dashboard/settings?tab=connections";
  const { target: safeRedirectTarget, rejected } = resolveOAuthSuccessRedirectUrl({
    value: typeof body.redirectUrl === "string" ? body.redirectUrl : undefined,
    baseUrl,
    fallbackPath: defaultRedirectPath,
    allowedAbsoluteOrigins: [
      ...getDefaultPlatformRedirectOrigins(),
      ...LOOPBACK_REDIRECT_ORIGINS,
    ],
  });
  if (rejected) {
    logger.warn("[Twitter Connect API] Rejected unsafe redirect URL", {
      redirectUrl:
        typeof body.redirectUrl === "string" ? body.redirectUrl : undefined,
    });
  }
  const redirectUrl = safeRedirectTarget.toString();
  const callbackUrl = `${baseUrl}/api/v1/twitter/callback`;

  let authLink;
  try {
    authLink = await twitterAutomationService.generateAuthLink(callbackUrl, connectionRole);
  } catch (error) {
    logger.error("[Twitter Connect API] Failed to generate auth link", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Twitter integration is currently unavailable" },
      { status: 503 },
    );
  }

  if (authLink.flow === "oauth1a") {
    await cache.set(
      `twitter_oauth:${authLink.oauthToken}`,
      JSON.stringify({
        oauthTokenSecret: authLink.oauthTokenSecret,
        organizationId: user.organization_id,
        userId: user.id,
        connectionRole,
        redirectUrl,
      }),
      600,
    );
  } else {
    await cache.set(
      `twitter_oauth2:${authLink.state}`,
      JSON.stringify({
        codeVerifier: authLink.codeVerifier,
        redirectUri: authLink.redirectUri,
        organizationId: user.organization_id,
        userId: user.id,
        connectionRole,
        redirectUrl,
      }),
      600,
    );
  }

  return NextResponse.json({
    authUrl: authLink.url,
    oauthToken: authLink.flow === "oauth1a" ? authLink.oauthToken : undefined,
    state: authLink.flow === "oauth2" ? authLink.state : undefined,
    flow: authLink.flow,
    connectionRole,
  });
}
