/**
 * Webhooks Status API
 *
 * Returns the webhook configuration status for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { webhookAutomationService } from "@/lib/services/webhook-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const status = await webhookAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    webhookCount: status.webhooks.length,
    error: status.error,
  });
}
