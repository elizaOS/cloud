/**
 * WhatsApp Status API
 *
 * Returns the connection status of WhatsApp for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const status = await whatsappAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    phoneNumber: status.phoneNumber,
    twilioConnected: status.twilioConnected,
    error: status.error,
  });
}
