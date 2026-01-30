/**
 * Slack Channels API
 *
 * Returns list of channels the bot can access.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { slackAutomationService } from "@/lib/services/slack-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const channels = await slackAutomationService.getChannels(
    user.organization_id
  );

  return NextResponse.json({ channels });
}
