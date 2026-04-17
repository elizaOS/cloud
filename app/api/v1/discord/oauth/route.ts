/**
 * Discord OAuth API
 *
 * Initiates the OAuth2 flow to add the bot to a Discord server.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { resolveSafeRedirectTarget } from "@/lib/security/redirect-validation";
import { discordAutomationService } from "@/lib/services/discord-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Check if Discord is configured
  if (!discordAutomationService.isOAuthConfigured()) {
    return NextResponse.json(
      { error: "Discord integration not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const defaultReturnPath = "/dashboard/settings?tab=connections";
  const safeReturnTarget = resolveSafeRedirectTarget(
    searchParams.get("returnUrl"),
    baseUrl,
    defaultReturnPath,
  );
  const returnUrl = `${safeReturnTarget.pathname}${safeReturnTarget.search}${safeReturnTarget.hash}`;

  const state = {
    organizationId: user.organization_id,
    userId: user.id,
    returnUrl,
    nonce: randomBytes(16).toString("hex"),
  };

  const oauthUrl = discordAutomationService.generateOAuthUrl(state);

  return NextResponse.redirect(oauthUrl);
}
