/**
 * WhatsApp Connect Route
 *
 * Stores WhatsApp Business API credentials for an organization.
 * Validates the access token against Meta Graph API before storing.
 * Auto-generates a verify token for webhook handshake.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = await request.json();
    const { accessToken, phoneNumberId, appSecret, businessPhone } = body;

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    if (!phoneNumberId) {
      return NextResponse.json({ error: "Phone Number ID is required" }, { status: 400 });
    }

    if (!appSecret) {
      return NextResponse.json({ error: "App Secret is required" }, { status: 400 });
    }

    // Validate the access token by calling Meta Graph API
    const validation = await whatsappAutomationService.validateAccessToken(
      accessToken,
      phoneNumberId,
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid credentials" },
        { status: 400 },
      );
    }

    // Auto-generate a verify token for webhook handshake
    const verifyToken = whatsappAutomationService.generateVerifyToken();

    // Store credentials
    await whatsappAutomationService.storeCredentials(user.organization_id, user.id, {
      accessToken,
      phoneNumberId,
      appSecret,
      verifyToken,
      businessPhone: businessPhone || validation.phoneDisplay,
    });

    // Get the webhook URL to display to user
    const webhookUrl = whatsappAutomationService.getWebhookUrl(user.organization_id);

    logger.info("[WhatsApp Connect] Credentials stored", {
      organizationId: user.organization_id,
      userId: user.id,
      hasBusinessPhone: !!(businessPhone || validation.phoneDisplay),
    });

    return NextResponse.json({
      success: true,
      message: "WhatsApp connected successfully",
      webhookUrl,
      verifyToken,
      businessPhone: businessPhone || validation.phoneDisplay,
      instructions:
        "Configure the webhook URL and verify token in your Meta App Dashboard under WhatsApp > Configuration.",
    });
  } catch (error) {
    logger.error("[WhatsApp Connect] Failed to connect", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 500 });
  }
}
