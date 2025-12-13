import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const c = await platformCredentialsService.getCredential(id, authResult.organization_id);
  if (!c) return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    connection: {
      id: c.id, platform: c.platform, username: c.platform_username, displayName: c.platform_display_name,
      avatarUrl: c.platform_avatar_url, status: c.status, scopes: c.scopes, linkedAt: c.linked_at, tokenExpiresAt: c.token_expires_at,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  await platformCredentialsService.revokeCredential(id, authResult.organization_id);
  logger.info("[SocialConnections] Revoked", { credentialId: id, userId: authResult.id });
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.action !== "refresh") {
    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  }

  const success = await platformCredentialsService.refreshToken(id, authResult.organization_id);
  if (!success) {
    return NextResponse.json({ success: false, error: "Token refresh failed. The connection may need to be re-authorized." }, { status: 400 });
  }

  logger.info("[SocialConnections] Token refreshed", { credentialId: id, userId: authResult.id });
  return NextResponse.json({ success: true, message: "Token refreshed" });
}

