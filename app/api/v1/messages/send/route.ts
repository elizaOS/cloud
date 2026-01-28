/**
 * Send Message API
 *
 * POST /api/v1/messages/send
 *
 * Sends a message via Twilio (SMS) or Blooio (iMessage).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { dbRead } from "@/db/client";
import { agentPhoneNumbers } from "@/db/schemas";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SendMessageRequest {
  to: string;
  body: string;
  phoneNumberId?: string;
  provider?: "twilio" | "blooio";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = (await request.json()) as SendMessageRequest;
    const { to, body: messageBody, phoneNumberId, provider } = body;

    if (!to) {
      return NextResponse.json(
        { error: "Recipient phone number (to) is required" },
        { status: 400 }
      );
    }

    if (!messageBody || messageBody.trim().length === 0) {
      return NextResponse.json(
        { error: "Message body is required" },
        { status: 400 }
      );
    }

    // Get the phone number to send from
    let fromPhoneNumber: typeof agentPhoneNumbers.$inferSelect | undefined;

    if (phoneNumberId) {
      // Use the specified phone number
      const result = await dbRead
        .select()
        .from(agentPhoneNumbers)
        .where(
          and(
            eq(agentPhoneNumbers.id, phoneNumberId),
            eq(agentPhoneNumbers.organization_id, user.organization_id)
          )
        )
        .limit(1);
      fromPhoneNumber = result[0];
    } else if (provider) {
      // Get the first active phone number for this provider
      const result = await dbRead
        .select()
        .from(agentPhoneNumbers)
        .where(
          and(
            eq(agentPhoneNumbers.organization_id, user.organization_id),
            eq(agentPhoneNumbers.provider, provider),
            eq(agentPhoneNumbers.is_active, true)
          )
        )
        .limit(1);
      fromPhoneNumber = result[0];
    } else {
      // Get any active phone number
      const result = await dbRead
        .select()
        .from(agentPhoneNumbers)
        .where(
          and(
            eq(agentPhoneNumbers.organization_id, user.organization_id),
            eq(agentPhoneNumbers.is_active, true)
          )
        )
        .limit(1);
      fromPhoneNumber = result[0];
    }

    if (!fromPhoneNumber) {
      return NextResponse.json(
        { error: "No active phone number found. Please set up a phone number first." },
        { status: 400 }
      );
    }

    logger.info("[Messages] Sending message", {
      organizationId: user.organization_id,
      to,
      provider: fromPhoneNumber.provider,
      phoneNumberId: fromPhoneNumber.id,
    });

    let result: { success: boolean; messageId?: string; error?: string };

    if (fromPhoneNumber.provider === "twilio") {
      // Send via Twilio
      result = await twilioAutomationService.sendMessage(
        user.organization_id,
        {
          to,
          body: messageBody,
          from: fromPhoneNumber.phone_number,
        }
      );
    } else if (fromPhoneNumber.provider === "blooio") {
      // Send via Blooio
      // For Blooio, we need a chat ID (phone number in E.164 format)
      result = await blooioAutomationService.sendMessage(
        user.organization_id,
        to, // Use the recipient phone number as chat ID
        {
          text: messageBody,
        }
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported provider: ${fromPhoneNumber.provider}` },
        { status: 400 }
      );
    }

    if (!result.success) {
      logger.error("[Messages] Failed to send message", {
        organizationId: user.organization_id,
        error: result.error,
      });
      return NextResponse.json(
        { error: result.error || "Failed to send message" },
        { status: 500 }
      );
    }

    logger.info("[Messages] Message sent successfully", {
      organizationId: user.organization_id,
      messageId: result.messageId,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: fromPhoneNumber.provider,
      from: fromPhoneNumber.phone_number,
      to,
    });
  } catch (error) {
    logger.error("[Messages] Failed to send message", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
