/**
 * Google OAuth Callback Route
 *
 * Handles the OAuth callback from Google after user authorization.
 * Exchanges the authorization code for tokens and stores them securely.
 *
 * Security hardening:
 * - Rate limited to 10 requests per minute per IP to prevent brute-force attacks
 * - OAuth state is bound to user's organization ID for CSRF protection
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cache } from "@/lib/cache/client";
import { secretsService } from "@/lib/services/secrets";
import { dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import {
  exchangeGoogleCode,
  getGoogleUserInfo,
} from "@/lib/utils/google-api";
import { withRateLimit } from "@/lib/middleware/rate-limit";

/**
 * Zod schema for OAuth state validation
 * This ensures type safety and prevents type confusion attacks
 */
const OAuthStateSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  redirectUrl: z.string(),
  scopes: z.array(z.string()),
});

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Whitelist of allowed redirect paths to prevent open redirect attacks
// Uses exact matching to prevent bypass via prefix matching
const ALLOWED_REDIRECT_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/connections",
  "/dashboard/agents",
  "/settings",
];

/**
 * Normalize a path by resolving .. and . segments to prevent path traversal
 */
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

/**
 * Validate that a redirect URL is safe (same origin and allowed path)
 * Uses exact path matching to prevent open redirect bypass
 */
function isValidRedirectUrl(url: string, baseUrl: string): boolean {
  // Allow relative paths that exactly match allowed paths
  if (!url.startsWith("http")) {
    const rawPath = url.startsWith("/") ? url : `/${url}`;
    // Normalize path to prevent traversal attacks (e.g., /dashboard/../../../evil)
    const normalizedPath = normalizePath(rawPath);
    // Use exact matching to prevent bypass via "/allowed-path-malicious"
    return ALLOWED_REDIRECT_PATHS.includes(normalizedPath);
  }

  // For absolute URLs, ensure same origin and allowed path
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.origin !== base.origin) {
      return false;
    }
    // Use exact matching for pathname as well
    return ALLOWED_REDIRECT_PATHS.includes(parsed.pathname);
  } catch {
    return false;
  }
}

async function handleCallback(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const defaultRedirect = `${baseUrl}/dashboard/settings?tab=connections`;

  // Handle errors from Google
  if (error) {
    logger.warn("[Google Callback] Authorization denied", { error });
    return NextResponse.redirect(
      `${defaultRedirect}&google_error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${defaultRedirect}&google_error=missing_params`,
    );
  }

  // Retrieve and validate state
  // NOTE: We do NOT authenticate the incoming request because OAuth callbacks
  // are browser redirects from Google that don't carry our auth cookies.
  // Security is provided by the cryptographically-random state parameter
  // that was created during the authenticated POST to /api/v1/google/oauth.
  const stateKey = `google_oauth:${state}`;
  const cachedState = await cache.get<unknown>(stateKey);

  if (!cachedState) {
    return NextResponse.redirect(
      `${defaultRedirect}&google_error=expired_or_invalid_state`,
    );
  }

  // Handle both object (Upstash auto-deserializes) and string formats
  // Then validate with Zod schema to prevent type confusion attacks
  let stateData: z.infer<typeof OAuthStateSchema>;
  try {
    const rawState = typeof cachedState === 'string'
      ? JSON.parse(cachedState)
      : cachedState;
    stateData = OAuthStateSchema.parse(rawState);
  } catch (parseError) {
    logger.error("[Google Callback] SECURITY: Invalid state structure - possible tampering", {
      error: parseError instanceof Error ? parseError.message : "Unknown error",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      `${defaultRedirect}&google_error=invalid_state`,
    );
  }

  // The state validation above provides CSRF protection because:
  // 1. The state UUID is cryptographically random and unguessable
  // 2. It was created during an authenticated request to POST /api/v1/google/oauth
  // 3. It's stored server-side in Redis with a 10-minute TTL
  // 4. An attacker would need to guess a valid UUID to forge a callback

  // Validate and construct redirect URL (prevent open redirect attacks)
  const stateRedirectUrl = stateData.redirectUrl || "/dashboard/settings?tab=connections";

  logger.info("[Google Callback] Redirect URL from state", {
    stateRedirectUrl,
    organizationId: stateData.organizationId,
  });

  // Validate the redirect URL against whitelist
  if (!isValidRedirectUrl(stateRedirectUrl, baseUrl)) {
    logger.error("[Google Callback] SECURITY: Invalid redirect URL attempted - possible open redirect attack", {
      redirectUrl: stateRedirectUrl,
      organizationId: stateData.organizationId,
      userId: stateData.userId,
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
    });
    // Fall back to safe default
    return NextResponse.redirect(defaultRedirect);
  }

  const redirectUrl = stateRedirectUrl.startsWith("http")
    ? stateRedirectUrl
    : `${baseUrl}${stateRedirectUrl.startsWith("/") ? "" : "/"}${stateRedirectUrl}`;

  // Get OAuth credentials
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = `${baseUrl}/api/v1/google/callback`;

  if (!clientId || !clientSecret) {
    logger.error("[Google Callback] Missing OAuth configuration");
    await cache.del(stateKey);
    return NextResponse.redirect(
      appendError(redirectUrl, "google_error=configuration_error"),
    );
  }

  // Exchange code for tokens
  let tokens: Awaited<ReturnType<typeof exchangeGoogleCode>>;
  try {
    tokens = await exchangeGoogleCode({
      code,
      clientId,
      clientSecret,
      redirectUri: callbackUrl,
    });
  } catch (err) {
    logger.error("[Google Callback] Token exchange failed", {
      error: err instanceof Error ? err.message : String(err),
      organizationId: stateData.organizationId,
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      appendError(redirectUrl, "google_error=token_exchange_failed"),
    );
  }

  // Get user info
  let userInfo: Awaited<ReturnType<typeof getGoogleUserInfo>>;
  try {
    userInfo = await getGoogleUserInfo(tokens.access_token);
  } catch (err) {
    logger.error("[Google Callback] Failed to get user info", {
      error: err instanceof Error ? err.message : String(err),
      organizationId: stateData.organizationId,
    });
    await cache.del(stateKey);
    return NextResponse.redirect(
      appendError(redirectUrl, "google_error=userinfo_failed"),
    );
  }

  // Store credentials
  // Track newly created secrets for cleanup if platform_credentials insert fails
  const newlyCreatedSecretIds: string[] = [];

  try {
    const audit = {
      actorType: "user" as const,
      actorId: stateData.userId,
      source: "google-oauth-callback",
    };

    // Check if credentials already exist for this Google account
    const existingCreds = await dbWrite
      .select({
        id: platformCredentials.id,
        access_token_secret_id: platformCredentials.access_token_secret_id,
        refresh_token_secret_id: platformCredentials.refresh_token_secret_id,
      })
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, stateData.organizationId),
          eq(platformCredentials.platform, "google"),
          eq(platformCredentials.platform_user_id, userInfo.id),
        ),
      )
      .limit(1);

    let accessTokenSecretId: string;
    let refreshTokenSecretId: string | undefined;

    if (existingCreds.length > 0 && existingCreds[0].access_token_secret_id) {
      // Update existing secrets
      logger.info("[Google Callback] Updating existing credentials");
      
      // Update access token
      await secretsService.rotate(
        existingCreds[0].access_token_secret_id,
        stateData.organizationId,
        tokens.access_token,
        audit,
      );
      accessTokenSecretId = existingCreds[0].access_token_secret_id;

      // Update refresh token if provided
      if (tokens.refresh_token && existingCreds[0].refresh_token_secret_id) {
        await secretsService.rotate(
          existingCreds[0].refresh_token_secret_id,
          stateData.organizationId,
          tokens.refresh_token,
          audit,
        );
        refreshTokenSecretId = existingCreds[0].refresh_token_secret_id;
      } else if (tokens.refresh_token) {
        // Create new refresh token secret if it doesn't exist
        const refreshTokenSecret = await secretsService.create(
          {
            organizationId: stateData.organizationId,
            name: `GOOGLE_REFRESH_TOKEN_${userInfo.id}`,
            value: tokens.refresh_token,
            scope: "organization",
            createdBy: stateData.userId,
          },
          audit,
        );
        refreshTokenSecretId = refreshTokenSecret.id;
        newlyCreatedSecretIds.push(refreshTokenSecret.id);
      }
    } else {
      // Create new secrets (or find existing orphaned secrets)
      logger.info("[Google Callback] Creating new credentials");
      
      // Try to create access token secret, handle if it already exists
      try {
        const accessTokenSecret = await secretsService.create(
          {
            organizationId: stateData.organizationId,
            name: `GOOGLE_ACCESS_TOKEN_${userInfo.id}`,
            value: tokens.access_token,
            scope: "organization",
            createdBy: stateData.userId,
          },
          audit,
        );
        accessTokenSecretId = accessTokenSecret.id;
        newlyCreatedSecretIds.push(accessTokenSecret.id);
      } catch (createErr) {
        // If secret already exists, find it and update it
        if (createErr instanceof Error && createErr.message.includes("already exists")) {
          logger.info("[Google Callback] Access token secret exists, finding and updating");
          const existingSecrets = await secretsService.list(stateData.organizationId);
          const existingAccessSecret = existingSecrets.find(
            s => s.name === `GOOGLE_ACCESS_TOKEN_${userInfo.id}`
          );
          if (existingAccessSecret) {
            await secretsService.rotate(
              existingAccessSecret.id,
              stateData.organizationId,
              tokens.access_token,
              audit,
            );
            accessTokenSecretId = existingAccessSecret.id;
          } else {
            throw createErr; // Re-throw if we can't find it
          }
        } else {
          throw createErr;
        }
      }

      // Store refresh token if provided
      if (tokens.refresh_token) {
        try {
          const refreshTokenSecret = await secretsService.create(
            {
              organizationId: stateData.organizationId,
              name: `GOOGLE_REFRESH_TOKEN_${userInfo.id}`,
              value: tokens.refresh_token,
              scope: "organization",
              createdBy: stateData.userId,
            },
            audit,
          );
          refreshTokenSecretId = refreshTokenSecret.id;
          newlyCreatedSecretIds.push(refreshTokenSecret.id);
        } catch (createErr) {
          // If secret already exists, find it and update it
          if (createErr instanceof Error && createErr.message.includes("already exists")) {
            logger.info("[Google Callback] Refresh token secret exists, finding and updating");
            const existingSecrets = await secretsService.list(stateData.organizationId);
            const existingRefreshSecret = existingSecrets.find(
              s => s.name === `GOOGLE_REFRESH_TOKEN_${userInfo.id}`
            );
            if (existingRefreshSecret) {
              await secretsService.rotate(
                existingRefreshSecret.id,
                stateData.organizationId,
                tokens.refresh_token,
                audit,
              );
              refreshTokenSecretId = existingRefreshSecret.id;
            } else {
              throw createErr; // Re-throw if we can't find it
            }
          } else {
            throw createErr;
          }
        }
      }
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store in platform_credentials table
    await dbWrite.insert(platformCredentials).values({
      organization_id: stateData.organizationId,
      user_id: stateData.userId,
      platform: "google",
      platform_user_id: userInfo.id,
      platform_username: userInfo.email,
      platform_display_name: userInfo.name,
      platform_avatar_url: userInfo.picture,
      platform_email: userInfo.email,
      status: "active",
      access_token_secret_id: accessTokenSecretId,
      refresh_token_secret_id: refreshTokenSecretId,
      token_expires_at: tokenExpiresAt,
      scopes: stateData.scopes,
      source_type: "web",
      linked_at: new Date(),
    }).onConflictDoUpdate({
      target: [
        platformCredentials.organization_id,
        platformCredentials.platform,
        platformCredentials.platform_user_id,
      ],
      set: {
        access_token_secret_id: accessTokenSecretId,
        refresh_token_secret_id: refreshTokenSecretId,
        token_expires_at: tokenExpiresAt,
        scopes: stateData.scopes,
        status: "active",
        updated_at: new Date(),
      },
    });

    logger.info("[Google Callback] Credentials stored successfully", {
      organizationId: stateData.organizationId,
      userId: stateData.userId,
      googleEmail: userInfo.email,
      scopes: stateData.scopes.length,
    });
  } catch (err) {
    logger.error("[Google Callback] Failed to store credentials", {
      error: err instanceof Error ? err.message : String(err),
      organizationId: stateData.organizationId,
    });

    // Clean up any newly created secrets to prevent orphans
    // This handles the case where secrets were created but platform_credentials insert failed
    if (newlyCreatedSecretIds.length > 0) {
      const cleanupAudit = {
        actorType: "system" as const,
        actorId: "oauth-cleanup",
        source: "google-oauth-callback-rollback",
      };

      for (const secretId of newlyCreatedSecretIds) {
        try {
          await secretsService.delete(secretId, stateData.organizationId, cleanupAudit);
          logger.info("[Google Callback] Cleaned up orphaned secret", {
            secretId,
            organizationId: stateData.organizationId,
          });
        } catch (cleanupErr) {
          // Log but don't fail - cleanup is best-effort
          logger.error("[Google Callback] Failed to clean up orphaned secret", {
            secretId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }
    }

    await cache.del(stateKey);
    return NextResponse.redirect(
      appendError(redirectUrl, "google_error=storage_failed"),
    );
  }

  // Clean up state
  await cache.del(stateKey);

  // Redirect with success
  const successParams = `google_connected=true&google_email=${encodeURIComponent(userInfo.email)}`;
  const finalRedirectUrl = appendSuccess(redirectUrl, successParams);

  logger.info("[Google Callback] Final redirect", {
    redirectUrl,
    finalRedirectUrl,
    organizationId: stateData.organizationId,
  });

  return NextResponse.redirect(finalRedirectUrl);
}

function appendError(url: string, error: string): string {
  return url.includes("?") ? `${url}&${error}` : `${url}?${error}`;
}

function appendSuccess(url: string, params: string): string {
  return url.includes("?") ? `${url}&${params}` : `${url}?${params}`;
}

/**
 * Get IP address from request for rate limiting
 */
function getIpKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `oauth:google:callback:ip:${ip}`;
}

// Export with rate limiting: 10 requests per minute per IP
// This prevents brute-force attacks on the OAuth callback
export const GET = withRateLimit(handleCallback, {
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyGenerator: getIpKey,
});
