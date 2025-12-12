import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, MANUAL_AUTH_PLATFORMS, SOCIAL_PLATFORMS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const ManualCredentialsSchema = z.object({
  platform: z.enum(["bluesky", "telegram"]),
  credentials: z.object({
    handle: z.string().optional(),
    appPassword: z.string().optional(),
    botToken: z.string().optional(),
  }),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const platforms = await platformCredentialsService.getAvailablePlatforms(authResult.user.organization_id);
  return NextResponse.json({
    success: true,
    platforms: platforms.filter(p => SOCIAL_PLATFORMS.includes(p.platform)),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const body = await request.json();
  const parsed = ManualCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { platform, credentials } = parsed.data;

  if (!MANUAL_AUTH_PLATFORMS.includes(platform as typeof MANUAL_AUTH_PLATFORMS[number])) {
    return NextResponse.json({ 
      success: false, 
      error: `Platform ${platform} requires OAuth. Use /api/v1/social-connections/connect/${platform} instead.` 
    }, { status: 400 });
  }

  const credential = await platformCredentialsService.storeManualCredentials({
    organizationId: user.organization_id,
    userId: user.id,
    platform: platform as "bluesky" | "telegram",
    credentials,
  });

  logger.info("[SocialConnections] Manual credentials stored", { 
    platform, 
    userId: user.id,
    credentialId: credential.id 
  });

  return NextResponse.json({
    success: true,
    connection: {
      id: credential.id,
      platform: credential.platform,
      username: credential.platform_username,
      displayName: credential.platform_display_name,
      avatarUrl: credential.platform_avatar_url,
      status: credential.status,
      linkedAt: credential.linked_at,
    },
  });
}
