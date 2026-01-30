/**
 * WhatsApp Disconnect API
 *
 * Removes WhatsApp configuration for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";

export const maxDuration = 30;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  await whatsappAutomationService.removeCredentials(
    user.organization_id,
    user.id
  );

  return NextResponse.json({ success: true });
}
