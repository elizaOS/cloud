import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import {
  platformCredentialsService,
  OAUTH_CONFIGS,
  MANUAL_AUTH_PLATFORMS,
} from "@/lib/services/platform-credentials";
import type { PlatformType } from "@/db/schemas/platform-credentials";

const ConnectRequestSchema = z.object({
  callbackUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  instanceUrl: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { platform } = await params;
  const platformType = platform as PlatformType;

  const manualInfo = MANUAL_PLATFORM_INFO[platform];
  if (manualInfo) {
    return NextResponse.json(
      {
        success: false,
        error: `Platform ${platform} uses manual credentials. Use POST /api/v1/social-connections with credentials instead.`,
        authType: "manual",
        requiredFields: manualInfo.requiredFields,
        steps: manualInfo.steps,
      },
      { status: 400 },
    );
  }

  if (!OAUTH_CONFIGS[platformType]) {
    return NextResponse.json(
      { success: false, error: `Unsupported platform: ${platform}` },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ConnectRequestSchema.safeParse(body);
  const options = parsed.success ? parsed.data : {};

  const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const defaultCallback = `${cloudUrl}/dashboard/settings/connections?completed=${platform}`;

  // Handle Mastodon specially (instance-based OAuth)
  if (platform === "mastodon") {
    if (!options.instanceUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Mastodon requires instanceUrl parameter",
          example: { instanceUrl: "mastodon.social" },
        },
        { status: 400 },
      );
    }

    const session = await platformCredentialsService.createMastodonLinkSession({
      organizationId: authResult.organization_id,
      platform: "mastodon",
      requestingUserId: authResult.id,
      requestedScopes: options.scopes,
      callbackUrl: options.callbackUrl || defaultCallback,
      callbackType: "redirect",
      instanceUrl: options.instanceUrl,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      authUrl: session.linkUrl,
      expiresAt: session.expiresAt,
    });
  }

  // Standard OAuth flow
  const session = await platformCredentialsService.createLinkSession({
    organizationId: authResult.organization_id,
    platform: platformType,
    requestingUserId: authResult.id,
    requestedScopes: options.scopes,
    callbackUrl: options.callbackUrl || defaultCallback,
    callbackType: "redirect",
  });

  return NextResponse.json({
    success: true,
    sessionId: session.sessionId,
    authUrl: session.linkUrl,
    expiresAt: session.expiresAt,
  });
}

const MANUAL_PLATFORM_INFO: Record<
  string,
  { authType: string; requiredFields: string[]; steps: string[] }
> = {
  bluesky: {
    authType: "app_password",
    requiredFields: ["handle", "appPassword"],
    steps: [
      "Go to bsky.app/settings/app-passwords",
      "Create app password named 'ElizaCloud'",
      "Copy the password",
    ],
  },
  telegram: {
    authType: "bot_token",
    requiredFields: ["botToken"],
    steps: [
      "Message @BotFather on Telegram",
      "Send /newbot and follow prompts",
      "Copy the bot token",
    ],
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const platformType = platform as PlatformType;

  const manualInfo = MANUAL_PLATFORM_INFO[platform];
  if (manualInfo) {
    return NextResponse.json({ success: true, platform, ...manualInfo });
  }

  const config = OAUTH_CONFIGS[platformType];
  if (!config) {
    return NextResponse.json(
      { success: false, error: `Unsupported platform: ${platform}` },
      { status: 404 },
    );
  }

  const configured = !!process.env[config.clientIdEnv];
  return NextResponse.json({
    success: true,
    platform,
    authType: "oauth",
    configured,
    scopes: config.scopes,
  });
}
