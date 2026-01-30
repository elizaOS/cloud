/**
 * Slack Disconnect API
 *
 * Removes Slack credentials for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { slackAutomationService } from "@/lib/services/slack-automation";

export const maxDuration = 30;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  await slackAutomationService.removeCredentials(
    user.organization_id,
    user.id
  );

  return NextResponse.json({ success: true });
}
