import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAppAuth as requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, MANUAL_AUTH_PLATFORMS, SOCIAL_PLATFORMS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const BlueskyCredentialsSchema = z.object({
  platform: z.literal("bluesky"),
  credentials: z.object({
    handle: z.string().min(1, "Handle is required"),
    appPassword: z.string().min(1, "App password is required"),
  }),
});

const TelegramCredentialsSchema = z.object({
  platform: z.literal("telegram"),
  credentials: z.object({
    botToken: z.string().min(1, "Bot token is required").regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid bot token format"),
  }),
});

const ManualCredentialsSchema = z.discriminatedUnion("platform", [
  BlueskyCredentialsSchema,
  TelegramCredentialsSchema,
]);

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
    return NextResponse.json({ 
      success: false, 
      error: parsed.error.issues[0]?.message || "Invalid request",
    }, { status: 400 });
  }

  const { platform, credentials } = parsed.data;

  // Type guard: parsed.data.platform is already narrowed to "bluesky" | "telegram" by zod schema
  // but we need to ensure it matches MANUAL_AUTH_PLATFORMS for type safety
  if (!(MANUAL_AUTH_PLATFORMS[0] === platform || MANUAL_AUTH_PLATFORMS[1] === platform)) {
    return NextResponse.json({ 
      success: false, 
      error: `Platform ${platform} requires OAuth. Use /api/v1/social-connections/connect/${platform} instead.` 
    }, { status: 400 });
  }

  const credential = await platformCredentialsService.storeManualCredentials({
    organizationId: user.organization_id,
    userId: user.id,
    platform: platform as ManualAuthPlatform,
    credentials,
  });

  logger.info("[SocialConnections] Manual credentials stored", { 
    platform, 
    userId: user.id,
    credentialId: credential.id,
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

