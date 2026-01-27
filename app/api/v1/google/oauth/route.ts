/**
 * Google OAuth Connect Route
 *
 * Initiates the Google OAuth flow for Gmail, Calendar, and Contacts access.
 * Returns an authorization URL for the user to grant permissions.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { cache } from "@/lib/cache/client";
import { generateGoogleAuthUrl, DEFAULT_GOOGLE_SCOPES } from "@/lib/utils/google-api";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return NextResponse.json(
      { error: "Google OAuth is not configured on this platform" },
      { status: 503 },
    );
  }

  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json().catch(() => ({}));
  const redirectUrl = body.redirectUrl || "/dashboard/settings?tab=connections";
  const requestedScopes = body.scopes || DEFAULT_GOOGLE_SCOPES;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const callbackUrl = `${baseUrl}/api/v1/google/callback`;

  // Generate a unique state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in cache for verification in callback
  const stateKey = `google_oauth:${state}`;
  await cache.set(
    stateKey,
    {
      organizationId: user.organization_id,
      userId: user.id,
      redirectUrl,
      scopes: requestedScopes,
    },
    600, // 10 minutes expiry in seconds
  );

  // Generate the authorization URL
  const authUrl = generateGoogleAuthUrl({
    clientId,
    redirectUri: callbackUrl,
    state,
    scopes: requestedScopes,
    accessType: "offline",
    prompt: "consent", // Always show consent to get refresh token
  });

  logger.info("[Google OAuth] Generated auth URL", {
    organizationId: user.organization_id,
    userId: user.id,
    scopes: requestedScopes.length,
  });

  return NextResponse.json({
    authUrl,
    state,
  });
}
