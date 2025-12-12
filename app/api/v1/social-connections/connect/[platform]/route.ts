/**
 * Start OAuth flow for a platform
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/middleware/app-auth";
import { platformCredentialsService, OAUTH_CONFIGS, MANUAL_AUTH_PLATFORMS } from "@/lib/services/platform-credentials";
import type { PlatformType } from "@/db/schemas/platform-credentials";

const ConnectRequestSchema = z.object({
  callbackUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  instanceUrl: z.string().optional(), // For Mastodon
});

/**
 * POST /api/v1/social-connections/connect/[platform]
 * Start OAuth flow for the specified platform
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { platform } = await params;

  // Validate platform
  if (MANUAL_AUTH_PLATFORMS.includes(platform as typeof MANUAL_AUTH_PLATFORMS[number])) {
    return NextResponse.json({
      success: false,
      error: `Platform ${platform} uses manual credentials. Use POST /api/v1/social-connections with credentials instead.`,
      authType: "manual",
      instructions: platform === "bluesky"
        ? { handle: "Your Bluesky handle (e.g., @user.bsky.social)", appPassword: "Generate at bsky.app/settings/app-passwords" }
        : { botToken: "Create a bot via @BotFather on Telegram and copy the token" },
    }, { status: 400 });
  }

  if (!OAUTH_CONFIGS[platform]) {
    return NextResponse.json({ success: false, error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ConnectRequestSchema.safeParse(body);
  const options = parsed.success ? parsed.data : {};

  const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const defaultCallback = `${cloudUrl}/dashboard/settings/connections?completed=${platform}`;

  // Handle Mastodon specially (instance-based OAuth)
  if (platform === "mastodon") {
    if (!options.instanceUrl) {
      return NextResponse.json({
        success: false,
        error: "Mastodon requires instanceUrl parameter",
        example: { instanceUrl: "mastodon.social" },
      }, { status: 400 });
    }

    const session = await platformCredentialsService.createMastodonLinkSession({
      organizationId: user.organization_id,
      platform: "mastodon",
      requestingUserId: user.id,
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
    organizationId: user.organization_id,
    platform: platform as PlatformType,
    requestingUserId: user.id,
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

/**
 * GET /api/v1/social-connections/connect/[platform]
 * Get platform connection requirements
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  if (MANUAL_AUTH_PLATFORMS.includes(platform as typeof MANUAL_AUTH_PLATFORMS[number])) {
    const instructions = platform === "bluesky"
      ? {
          platform: "bluesky",
          authType: "app_password",
          instructions: [
            "Go to bsky.app/settings/app-passwords",
            "Click 'Add App Password'",
            "Name it 'ElizaCloud' or similar",
            "Copy the generated password",
          ],
          requiredFields: ["handle", "appPassword"],
          exampleRequest: {
            platform: "bluesky",
            credentials: {
              handle: "@yourname.bsky.social",
              appPassword: "xxxx-xxxx-xxxx-xxxx",
            },
          },
        }
      : {
          platform: "telegram",
          authType: "bot_token",
          instructions: [
            "Open Telegram and message @BotFather",
            "Send /newbot and follow the prompts",
            "Copy the bot token provided",
            "Add your bot to channels/groups where you want it to post",
          ],
          requiredFields: ["botToken"],
          exampleRequest: {
            platform: "telegram",
            credentials: {
              botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxyz",
            },
          },
        };

    return NextResponse.json({ success: true, ...instructions });
  }

  const config = OAUTH_CONFIGS[platform];
  if (!config) {
    return NextResponse.json({ success: false, error: `Unsupported platform: ${platform}` }, { status: 404 });
  }

  const clientId = process.env[config.clientIdEnv];
  const configured = !!clientId;

  return NextResponse.json({
    success: true,
    platform,
    authType: "oauth",
    configured,
    scopes: config.scopes,
    message: configured
      ? "Send a POST request to this endpoint to start OAuth flow"
      : `OAuth not configured. Set ${config.clientIdEnv} and ${config.clientSecretEnv} environment variables.`,
  });
}
