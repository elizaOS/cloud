import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache/client";
import { resolveSafeRedirectTarget } from "@/lib/security/redirect-validation";
import { invalidateOAuthState } from "@/lib/services/oauth/invalidation";
import { twitterAutomationService } from "@/lib/services/twitter-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const oauthToken = searchParams.get("oauth_token");
  const oauthVerifier = searchParams.get("oauth_verifier");
  const denied = searchParams.get("denied");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const defaultRedirectPath = "/dashboard/settings?tab=connections";

  function buildRedirectUrl(redirectUrl: string | undefined, params: Record<string, string>): URL {
    const target = resolveSafeRedirectTarget(redirectUrl, baseUrl, defaultRedirectPath);

    Object.entries(params).forEach(([key, value]) => {
      target.searchParams.set(key, value);
    });

    return target;
  }

  if (denied) {
    return NextResponse.redirect(
      buildRedirectUrl(undefined, {
        twitter_error: "authorization_denied",
      }),
    );
  }

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(
      buildRedirectUrl(undefined, {
        twitter_error: "missing_params",
      }),
    );
  }

  const stateKey = `twitter_oauth:${oauthToken}`;
  const stateData = await cache.get(stateKey);

  if (!stateData) {
    return NextResponse.redirect(
      buildRedirectUrl(undefined, {
        twitter_error: "expired_or_invalid",
      }),
    );
  }

  // Cache may return object directly or JSON string depending on implementation
  let state: {
    oauthTokenSecret: string;
    organizationId: string;
    userId: string;
    redirectUrl?: string;
  };

  try {
    const parsed = typeof stateData === "string" ? JSON.parse(stateData) : stateData;

    // Validate required fields exist
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.oauthTokenSecret !== "string" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.userId !== "string"
    ) {
      throw new Error("Invalid state data structure");
    }

    state = parsed;
  } catch (error) {
    logger.error("[Twitter Callback] Failed to parse state data", {
      error: error instanceof Error ? error.message : String(error),
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      buildRedirectUrl(undefined, {
        twitter_error: "invalid_state",
      }),
    );
  }

  const redirectUrl = state.redirectUrl;

  let tokens;
  try {
    tokens = await twitterAutomationService.exchangeToken(
      oauthToken,
      state.oauthTokenSecret,
      oauthVerifier,
    );
  } catch (error) {
    logger.error("[Twitter Callback] Failed to exchange token", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: state.organizationId,
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      buildRedirectUrl(redirectUrl, {
        twitter_error: "token_exchange_failed",
      }),
    );
  }

  try {
    await twitterAutomationService.storeCredentials(state.organizationId, state.userId, {
      accessToken: tokens.accessToken,
      accessSecret: tokens.accessSecret,
      screenName: tokens.screenName,
      twitterUserId: tokens.userId,
    });
  } catch (error) {
    logger.error("[Twitter Callback] Failed to store credentials", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: state.organizationId,
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      buildRedirectUrl(redirectUrl, {
        twitter_error: "storage_failed",
      }),
    );
  }

  await cache.del(stateKey);

  await invalidateOAuthState(state.organizationId, "twitter", state.userId);

  return NextResponse.redirect(
    buildRedirectUrl(redirectUrl, {
      twitter_connected: "true",
      twitter_username: tokens.screenName,
    }),
  );
}
