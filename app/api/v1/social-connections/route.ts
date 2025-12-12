/**
 * Social Connections API
 * List and manage platform credential connections.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, MANUAL_AUTH_PLATFORMS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const ManualCredentialsSchema = z.object({
  platform: z.enum(["bluesky", "telegram"]),
  credentials: z.object({
    handle: z.string().optional(),
    appPassword: z.string().optional(),
    botToken: z.string().optional(),
  }),
});

/**
 * GET /api/v1/social-connections
 * List all connected platforms for the organization
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const platforms = await platformCredentialsService.getAvailablePlatforms(user.organization_id);

  return NextResponse.json({
    success: true,
    platforms: platforms.filter(p => 
      // Only return social platforms
      ["twitter", "bluesky", "discord", "telegram", "slack", "reddit", 
       "facebook", "instagram", "tiktok", "linkedin", "mastodon"].includes(p.platform)
    ),
  });
}

/**
 * POST /api/v1/social-connections
 * Store manual credentials (Bluesky app password, Telegram bot token)
 */
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
