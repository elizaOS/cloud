/**
 * WhatsApp Connect Route
 *
 * Stores WhatsApp Business API credentials for an organization.
 * Validates the access token against Meta Graph API before storing.
 * Auto-generates a verify token for webhook handshake.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WhatsappConnectBody = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  appSecret: z.string().min(1, "App Secret is required"),
  businessPhone: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const rawBody = await request.json();
    const parsed = WhatsappConnectBody.safeParse(rawBody);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || "Invalid request body";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { accessToken, phoneNumberId, appSecret, businessPhone } = parsed.data;

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
