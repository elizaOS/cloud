/**
 * Discord Status API
 *
 * Returns the connection status of Discord for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordAutomationService } from "@/lib/services/discord-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Check if Discord is configured at all
  const isConfigured = discordAutomationService.isConfigured();
  if (!isConfigured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      guilds: [],
      error: "Discord integration not configured",
    });
  }

  const status = await discordAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: true,
    connected: status.connected,
    guilds: status.guilds,
    error: status.error,
  });
}
