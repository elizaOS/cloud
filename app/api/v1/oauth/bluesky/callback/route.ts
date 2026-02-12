/**
 * Bluesky AT Protocol OAuth Callback Route
 *
 * GET /api/v1/oauth/bluesky/callback
 *
 * Handles the AT Protocol OAuth callback. The authorization server redirects
 * here with `code`, `state`, and `iss` parameters. The `iss` parameter is
 * AT Protocol-specific for authorization server verification.
 *
 * Security:
 * - Rate limited to prevent brute-force attacks
 * - State parameter provides CSRF protection (managed by @atproto/oauth-client-node)
 * - Redirect URL whitelist prevents open redirect attacks
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { handleBlueskyCallback } from "@/lib/services/oauth/providers";
import { invalidateByOrganization } from "@/lib/eliza/runtime-factory";
import { entitySettingsCache } from "@/lib/services/entity-settings/cache";
import { edgeRuntimeCache } from "@/lib/cache/edge-runtime-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_REDIRECT_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/connections",
  "/dashboard/agents",
  "/settings",
  "/auth/success",
];

function normalizePath(path: string): string {
  const segments = path.split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "..") {
      result.pop();
    } else if (segment !== "." && segment !== "") {
      result.push(segment);
    }
  }
  return "/" + result.join("/");
}

function extractPath(url: string): string {
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  let endIndex = url.length;
  if (queryIndex !== -1) endIndex = Math.min(endIndex, queryIndex);
  if (hashIndex !== -1) endIndex = Math.min(endIndex, hashIndex);
  return url.substring(0, endIndex);
}

function isValidRedirectUrl(url: string, baseUrl: string): boolean {
  if (!url.startsWith("http")) {
    const rawPath = url.startsWith("/") ? url : `/${url}`;
    const pathOnly = extractPath(rawPath);
    const normalizedPath = normalizePath(pathOnly);
    return ALLOWED_REDIRECT_PATHS.includes(normalizedPath);
  }

  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.origin !== base.origin) return false;
    return ALLOWED_REDIRECT_PATHS.includes(parsed.pathname);
  } catch {
    return false;
  }
}

function appendParam(url: string, param: string): string {
  return url.includes("?") ? `${url}&${param}` : `${url}?${param}`;
}

async function handleCallback(request: NextRequest): Promise<NextResponse> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const defaultRedirect = `${baseUrl}/dashboard/settings?tab=connections`;
  const searchParams = request.nextUrl.searchParams;

  // Check for error from authorization server
  const error = searchParams.get("error");
  if (error) {
    const errorDescription = searchParams.get("error_description");
    logger.warn("[Bluesky OAuth] Authorization denied", {
      error,
      errorDescription,
    });
    const errorParam = errorDescription
      ? `bluesky_error=${encodeURIComponent(error)}&bluesky_error_description=${encodeURIComponent(errorDescription)}`
      : `bluesky_error=${encodeURIComponent(error)}`;
    return NextResponse.redirect(appendParam(defaultRedirect, errorParam));
  }

  try {
    const result = await handleBlueskyCallback(searchParams);

    // Validate redirect URL
    let redirectUrl =
      result.redirectUrl || "/dashboard/settings?tab=connections";

    if (!isValidRedirectUrl(redirectUrl, baseUrl)) {
      logger.error(
        "[Bluesky OAuth] SECURITY: Invalid redirect URL attempted",
        {
          redirectUrl,
          organizationId: result.organizationId,
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
        },
      );
      redirectUrl = "/dashboard/settings?tab=connections";
    }

    const finalRedirectUrl = redirectUrl.startsWith("http")
      ? redirectUrl
      : `${baseUrl}${redirectUrl.startsWith("/") ? "" : "/"}${redirectUrl}`;

    const successParams = `bluesky_connected=true&platform=bluesky&connection_id=${result.connectionId}`;
    const finalUrl = appendParam(finalRedirectUrl, successParams);

    // Invalidate caches
    try {
      await Promise.all([
        invalidateByOrganization(result.organizationId),
        entitySettingsCache.invalidateUser(result.userId),
        edgeRuntimeCache.bumpMcpVersion(result.organizationId),
      ]);
    } catch (e) {
      logger.warn("[Bluesky OAuth] Cache invalidation failed", {
        error: String(e),
      });
    }

    logger.info("[Bluesky OAuth] Callback successful", {
      organizationId: result.organizationId,
      userId: result.userId,
      connectionId: result.connectionId,
      did: result.did,
      handle: result.handle,
    });

    return NextResponse.redirect(finalUrl);
  } catch (callbackError) {
    logger.error("[Bluesky OAuth] Callback failed", {
      error:
        callbackError instanceof Error
          ? callbackError.message
          : String(callbackError),
      stack:
        callbackError instanceof Error
          ? callbackError.stack
          : undefined,
    });

    const errorMessage =
      callbackError instanceof Error
        ? encodeURIComponent(callbackError.message)
        : "callback_failed";
    return NextResponse.redirect(
      appendParam(defaultRedirect, `bluesky_error=${errorMessage}`),
    );
  }
}

function getIpKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `oauth:bluesky:callback:ip:${ip}`;
}

export const GET = withRateLimit(handleCallback, {
  windowMs: 60000,
  maxRequests: 10,
  keyGenerator: getIpKey,
});
