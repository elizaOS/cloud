/**
 * Individual Credential API
 *
 * GET    /api/v1/credentials/[credentialId] - Get credential details
 * DELETE /api/v1/credentials/[credentialId] - Revoke credential
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ credentialId: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { credentialId } = await params;

  const result = await platformCredentialsService.getCredentialWithTokens(credentialId, user.organization_id);
  if (!result) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const { credential } = result;
  return NextResponse.json({
    id: credential.id,
    platform: credential.platform,
    platformUserId: credential.platform_user_id,
    platformUsername: credential.platform_username,
    platformDisplayName: credential.platform_display_name,
    platformAvatarUrl: credential.platform_avatar_url,
    platformEmail: credential.platform_email,
    status: credential.status,
    scopes: credential.scopes,
    grantedPermissions: credential.granted_permissions,
    linkedAt: credential.linked_at?.toISOString(),
    lastUsedAt: credential.last_used_at?.toISOString(),
    tokenExpiresAt: credential.token_expires_at?.toISOString(),
    expiresAt: credential.expires_at?.toISOString(),
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ credentialId: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { credentialId } = await params;

  await platformCredentialsService.revokeCredential(credentialId, user.organization_id);
  logger.info("[Credentials API] Revoked", { credentialId, userId: user.id });
  return NextResponse.json({ success: true });
}
