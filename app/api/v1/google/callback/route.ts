/**
 * Google OAuth Callback Route
 *
 * Handles the OAuth callback from Google after user authorization.
 * Exchanges the authorization code for tokens and stores them securely.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Whitelist of allowed redirect paths to prevent open redirect attacks
const ALLOWED_REDIRECT_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/connections",
  "/dashboard/agents",
  "/settings",
];

/**
 * Validate that a redirect URL is safe (same origin and allowed path)
 */
function isValidRedirectUrl(url: string, baseUrl: string): boolean {
  // Allow relative paths that start with allowed prefixes
  if (!url.startsWith("http")) {
    const path = url.startsWith("/") ? url : `/${url}`;
    return ALLOWED_REDIRECT_PATHS.some(allowed => path.startsWith(allowed));
  }

  // For absolute URLs, ensure same origin and allowed path
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (parsed.origin !== base.origin) {
      return false;
    }
    return ALLOWED_REDIRECT_PATHS.some(allowed => parsed.pathname.startsWith(allowed));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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
  const stateKey = `google_oauth:${state}`;
  const cachedState = await cache.get<{
    organizationId: string;
    userId: string;
    redirectUrl: string;
    scopes: string[];
  }>(stateKey);

  if (!cachedState) {
    return NextResponse.redirect(
      `${defaultRedirect}&google_error=expired_or_invalid_state`,
    );
  }

  // Handle both object (Upstash auto-deserializes) and string formats
  const stateData = typeof cachedState === 'string' 
    ? JSON.parse(cachedState) as {
        organizationId: string;
        userId: string;
        redirectUrl: string;
        scopes: string[];
      }
    : cachedState;

  // Validate and construct redirect URL (prevent open redirect attacks)
  const stateRedirectUrl = stateData.redirectUrl || "/dashboard/settings?tab=connections";

  // Validate the redirect URL against whitelist
  if (!isValidRedirectUrl(stateRedirectUrl, baseUrl)) {
    logger.warn("[Google Callback] Invalid redirect URL attempted", {
      redirectUrl: stateRedirectUrl,
      organizationId: stateData.organizationId,
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
    await cache.del(stateKey);
    return NextResponse.redirect(
      appendError(redirectUrl, "google_error=storage_failed"),
    );
  }

  // Clean up state
  await cache.del(stateKey);

  // Redirect with success
  const successParams = `google_connected=true&google_email=${encodeURIComponent(userInfo.email)}`;
  return NextResponse.redirect(appendSuccess(redirectUrl, successParams));
}

function appendError(url: string, error: string): string {
  return url.includes("?") ? `${url}&${error}` : `${url}?${error}`;
}

function appendSuccess(url: string, params: string): string {
  return url.includes("?") ? `${url}&${params}` : `${url}?${params}`;
}
