/**
 * Credential Token API
 *
 * GET /api/v1/credentials/[credentialId]/token - Get decrypted access tokens
 *
 * Automatically refreshes expired tokens when possible.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { credentialId } = await params;

  const result = await platformCredentialsService.getCredentialWithTokens(
    credentialId,
    user.organization_id,
  );
  if (!result)
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 },
    );

  const { credential, accessToken, refreshToken } = result;

  // Auto-refresh expired tokens
  if (
    credential.token_expires_at &&
    credential.token_expires_at < new Date() &&
    refreshToken
  ) {
    logger.info("[Credentials] Token expired, refreshing", {
      credentialId,
      platform: credential.platform,
    });
    const refreshed = await platformCredentialsService.refreshToken(
      credentialId,
      user.organization_id,
    );

    if (refreshed) {
      const fresh = await platformCredentialsService.getCredentialWithTokens(
        credentialId,
        user.organization_id,
      );
      if (fresh) {
        return NextResponse.json({
          platform: credential.platform,
          platformUserId: credential.platform_user_id,
          accessToken: fresh.accessToken,
          refreshToken: fresh.refreshToken,
          expiresAt: credential.token_expires_at?.toISOString(),
          scopes: credential.scopes,
          refreshed: true,
        });
      }
    }
    return NextResponse.json(
      { error: "Token expired and refresh failed", status: credential.status },
      { status: 401 },
    );
  }

  return NextResponse.json({
    platform: credential.platform,
    platformUserId: credential.platform_user_id,
    accessToken,
    refreshToken,
    expiresAt: credential.token_expires_at?.toISOString(),
    scopes: credential.scopes,
    refreshed: false,
  });
}
