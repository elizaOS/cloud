import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const credential = await platformCredentialsService.getCredential(id, authResult.user.organization_id);
  if (!credential) {
    return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    connection: {
      id: credential.id,
      platform: credential.platform,
      username: credential.platform_username,
      displayName: credential.platform_display_name,
      avatarUrl: credential.platform_avatar_url,
      status: credential.status,
      scopes: credential.scopes,
      linkedAt: credential.linked_at,
      tokenExpiresAt: credential.token_expires_at,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  await platformCredentialsService.revokeCredential(id, authResult.user.organization_id);
  logger.info("[SocialConnections] Revoked", { credentialId: id, userId: authResult.user.id });
  return NextResponse.json({ success: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.action === "refresh") {
    const success = await platformCredentialsService.refreshToken(id, user.organization_id);
    
    if (!success) {
      return NextResponse.json({ 
        success: false, 
        error: "Token refresh failed. The connection may need to be re-authorized." 
      }, { status: 400 });
    }

    logger.info("[SocialConnections] Token refreshed", { 
      credentialId: id, 
      userId: user.id 
    });

    return NextResponse.json({ success: true, message: "Token refreshed" });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
