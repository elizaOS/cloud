/**
 * Blooio Status Route
 *
 * Returns the current Blooio connection status for the organization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const status = await blooioAutomationService.getConnectionStatus(
      user.organization_id,
    );

    // Include webhook URL for reference
    const webhookUrl = blooioAutomationService.getWebhookUrl(
      user.organization_id,
    );

    return NextResponse.json({
      ...status,
      webhookUrl,
    });
  } catch (error) {
    logger.error("[Blooio Status] Failed to get status", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to get Blooio status" },
      { status: 500 },
    );
  }
}
