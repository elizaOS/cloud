/**
 * WhatsApp Status Route
 *
 * Returns the current WhatsApp connection status for the organization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const orgId = user.organization_id;

  try {
    // Fetch status and verify token in parallel
    const [status, verifyToken] = await Promise.all([
      whatsappAutomationService.getConnectionStatus(orgId),
      whatsappAutomationService.getVerifyToken(orgId),
    ]);

    return NextResponse.json({
      connected: status.connected,
      configured: status.configured,
      businessPhone: status.businessPhone,
      webhookUrl: whatsappAutomationService.getWebhookUrl(orgId),
      verifyToken: verifyToken || undefined,
      error: status.error,
    });
  } catch (error) {
    logger.error("[WhatsApp Status] Failed to get status", {
      error: error instanceof Error ? error.message : String(error),
      orgId,
    });
    return NextResponse.json(
      { error: "Failed to get WhatsApp status" },
      { status: 500 },
    );
  }
}
