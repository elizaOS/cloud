/**
 * Slack OAuth Initiation API
 *
 * Generates the OAuth URL for installing the Slack app to a workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { slackAutomationService } from "@/lib/services/slack-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!slackAutomationService.isConfigured()) {
    return NextResponse.json(
      { error: "Slack OAuth not configured" },
      { status: 503 }
    );
  }

  // Get return URL from query params
  const returnUrl =
    request.nextUrl.searchParams.get("returnUrl") ||
    "/dashboard/settings?tab=connections";

  const authUrl = slackAutomationService.generateOAuthUrl({
    organizationId: user.organization_id,
    userId: user.id,
    returnUrl,
  });

  return NextResponse.redirect(authUrl);
}
