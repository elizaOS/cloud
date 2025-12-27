/**
 * Platform Credentials API (First-Class Cloud Feature)
 *
 * OAuth credential management for connecting user accounts to platforms.
 * Works via session, API key, or app token auth.
 *
 * GET  /api/v1/credentials - List credentials
 * POST /api/v1/credentials - Create link session
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const CLOUD_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const searchParams = request.nextUrl.searchParams;
  const platform = searchParams.get("platform") as
    | "discord"
    | "twitter"
    | "google"
    | "gmail"
    | "github"
    | "slack"
    | "telegram"
    | undefined;
  const status = searchParams.get("status") || undefined;

  const credentials = await platformCredentialsService.listCredentials(
    user.organization_id,
    { platform, status },
  );

  return NextResponse.json({
    credentials: credentials.map((c) => ({
      id: c.id,
      platform: c.platform,
      platformUserId: c.platform_user_id,
      platformUsername: c.platform_username,
      platformDisplayName: c.platform_display_name,
      platformAvatarUrl: c.platform_avatar_url,
      platformEmail: c.platform_email,
      status: c.status,
      scopes: c.scopes,
      linkedAt: c.linked_at?.toISOString(),
      lastUsedAt: c.last_used_at?.toISOString(),
      expiresAt: c.expires_at?.toISOString(),
    })),
  });
}

// =============================================================================
// POST - Create link session
// =============================================================================

const CreateLinkSchema = z.object({
  platform: z.enum([
    "discord",
    "telegram",
    "twitter",
    "gmail",
    "google",
    "github",
    "slack",
  ]),
  scopes: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
  callbackType: z.enum(["redirect", "webhook", "message"]).optional(),
  callbackContext: z
    .object({
      platform: z.string().optional(),
      server_id: z.string().optional(),
      channel_id: z.string().optional(),
      user_id: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const appId = request.headers.get("X-App-Id") || undefined;

  const body = await request.json();
  const validation = CreateLinkSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request", details: validation.error.format() },
      { status: 400 },
    );
  }

  const data = validation.data;

  try {
    const result = await platformCredentialsService.createLinkSession({
      organizationId: user.organization_id,
      platform: data.platform,
      appId,
      requestingUserId: user.id,
      requestedScopes: data.scopes,
      callbackUrl: data.callbackUrl,
      callbackType: data.callbackType,
      callbackContext: data.callbackContext,
    });

    logger.info("[Credentials API] Link session created", {
      sessionId: result.sessionId.slice(0, 8),
      platform: data.platform,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      sessionId: result.sessionId,
      linkUrl: result.linkUrl,
      expiresAt: result.expiresAt.toISOString(),
      // Also provide a cloud-hosted link page as an alternative
      hostedLinkUrl: `${CLOUD_URL}/auth/platform-link?session=${result.sessionId}`,
    });
  } catch (error) {
    logger.error("[Credentials API] Failed to create link session", { error });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create link session",
      },
      { status: 500 },
    );
  }
}
