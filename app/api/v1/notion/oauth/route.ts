/**
 * Notion OAuth Initiation API
 *
 * Generates the OAuth URL for connecting to a Notion workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { notionAutomationService } from "@/lib/services/notion-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!notionAutomationService.isConfigured()) {
    return NextResponse.json(
      { error: "Notion OAuth not configured" },
      { status: 503 }
    );
  }

  // Get return URL from query params
  const returnUrl =
    request.nextUrl.searchParams.get("returnUrl") ||
    "/dashboard/settings?tab=connections";

  const authUrl = notionAutomationService.generateOAuthUrl({
    organizationId: user.organization_id,
    userId: user.id,
    returnUrl,
  });

  return NextResponse.redirect(authUrl);
}
