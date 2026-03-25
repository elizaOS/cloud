/**
 * WhatsApp Disconnect Route
 *
 * Removes WhatsApp credentials for an organization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handleDisconnect(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    await whatsappAutomationService.removeCredentials(user.organization_id, user.id);

    logger.info("[WhatsApp Disconnect] Credentials removed", {
      organizationId: user.organization_id,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: "WhatsApp disconnected successfully",
    });
  } catch (error) {
    logger.error("[WhatsApp Disconnect] Failed to disconnect", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json({ error: "Failed to disconnect WhatsApp" }, { status: 500 });
  }
}

// Support both POST and DELETE methods for disconnect
export const POST = handleDisconnect;
export const DELETE = handleDisconnect;
