import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, MANUAL_AUTH_PLATFORMS, SOCIAL_PLATFORMS, type ManualAuthPlatform } from "@/lib/services/platform-credentials";
import type { PlatformType } from "@/db/schemas/platform-credentials";
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

  const platforms = await platformCredentialsService.getAvailablePlatforms(authResult.organization_id);
  return NextResponse.json({
    success: true,
    platforms: platforms.filter(p => (SOCIAL_PLATFORMS as readonly PlatformType[]).includes(p.platform)),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

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
  // Both values are in MANUAL_AUTH_PLATFORMS, so this check is redundant but kept for runtime safety
  const isManualPlatform = (p: string): p is ManualAuthPlatform => {
    return MANUAL_AUTH_PLATFORMS.includes(p as ManualAuthPlatform);
  };

  if (!isManualPlatform(platform)) {
    return NextResponse.json({ 
      success: false, 
      error: `Platform ${platform} requires OAuth. Use /api/v1/social-connections/connect/${platform} instead.` 
    }, { status: 400 });
  }

  const credential = await platformCredentialsService.storeManualCredentials({
    organizationId: authResult.organization_id,
    userId: authResult.id,
    platform,
    credentials,
  });

  logger.info("[SocialConnections] Manual credentials stored", { 
    platform, 
    userId: authResult.id,
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

