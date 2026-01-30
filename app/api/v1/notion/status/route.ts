/**
 * Notion Status API
 *
 * Returns the connection status of Notion for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { notionAutomationService } from "@/lib/services/notion-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const isConfigured = notionAutomationService.isConfigured();

  if (!isConfigured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      error: "Notion OAuth not configured",
    });
  }

  const status = await notionAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    workspaceId: status.workspaceId,
    workspaceName: status.workspaceName,
    workspaceIcon: status.workspaceIcon,
    error: status.error,
  });
}
