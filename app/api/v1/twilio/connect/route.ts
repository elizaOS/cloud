/**
 * Twilio Connect Route
 *
 * Stores Twilio credentials for an organization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { invalidateOAuthState } from "@/lib/services/oauth/invalidation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { logger } from "@/lib/utils/logger";
import { isE164PhoneNumber } from "@/lib/utils/twilio-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const twilioConnectSchema = z.object({
  accountSid: z.string().min(1, "Account SID is required"),
  authToken: z.string().min(1, "Auth Token is required"),
  phoneNumber: z.string().min(1, "Phone Number is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }

    const parsedBody = twilioConnectSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || "Invalid request body" },
        { status: 400 },
      );
    }

    const { accountSid, authToken, phoneNumber } = parsedBody.data;

    // Validate phone number format
    if (!isE164PhoneNumber(phoneNumber)) {
      return NextResponse.json(
        { error: "Phone number must be in E.164 format (e.g., +15551234567)" },
        { status: 400 },
      );
    }

    // Validate the credentials
    const validation = await twilioAutomationService.validateCredentials(accountSid, authToken);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid Twilio credentials" },
        { status: 400 },
      );
    }

    // Store credentials
    await twilioAutomationService.storeCredentials(user.organization_id, user.id, {
      accountSid,
      authToken,
      phoneNumber,
    });

    // Get the webhook URL to display to user
    const webhookUrl = twilioAutomationService.getWebhookUrl(user.organization_id);

    await invalidateOAuthState(user.organization_id, "twilio", user.id);

    logger.info("[Twilio Connect] Credentials stored", {
      organizationId: user.organization_id,
      userId: user.id,
      phoneNumber,
      accountName: validation.accountName,
    });

    return NextResponse.json({
      success: true,
      message: "Twilio connected successfully",
      accountName: validation.accountName,
      phoneNumber,
      webhookUrl,
      instructions:
        "Configure this webhook URL in your Twilio phone number settings to receive inbound SMS.",
    });
  } catch (error) {
    logger.error("[Twilio Connect] Failed to connect", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json({ error: "Failed to connect Twilio" }, { status: 500 });
  }
}
