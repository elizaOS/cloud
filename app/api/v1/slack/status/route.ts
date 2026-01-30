/**
 * Slack Status API
 *
 * Returns the connection status of Slack for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { slackAutomationService } from "@/lib/services/slack-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const isConfigured = slackAutomationService.isConfigured();

  if (!isConfigured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      error: "Slack OAuth not configured",
    });
  }

  const status = await slackAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    teamId: status.teamId,
    teamName: status.teamName,
    teamIcon: status.teamIcon,
    botUserId: status.botUserId,
    error: status.error,
  });
}
