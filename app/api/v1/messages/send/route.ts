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
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { dbRead } from "@/db/client";
import { agentPhoneNumbers } from "@/db/schemas";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Rate limit config for message sending
// 30 messages per minute per organization to prevent SMS spam and cost amplification
// Dev limit is 100/min - high enough for testing but realistic enough to catch issues
const MESSAGE_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: process.env.NODE_ENV === "production" ? 30 : 100,
};

/**
 * Validate E.164 phone number format
 * E.164 format: + followed by country code and subscriber number (max 15 digits total)
 * Examples: +14155552671, +442071838750
 */
function isValidE164(phoneNumber: string): boolean {
  // E.164: starts with +, followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Normalize phone number to E.164 format if possible
 * Returns null if the number cannot be reasonably converted
 */
function normalizeToE164(phoneNumber: string): string | null {
  // Remove all non-digit characters except leading +
  let normalized = phoneNumber.replace(/[^\d+]/g, "");

  // If it starts with +, validate it's E.164
  if (normalized.startsWith("+")) {
    return isValidE164(normalized) ? normalized : null;
  }

  // If it's 10 digits, assume US/Canada and add +1
  if (/^\d{10}$/.test(normalized)) {
    normalized = `+1${normalized}`;
    return normalized;
  }

  // If it's 11 digits starting with 1, assume US/Canada
  if (/^1\d{10}$/.test(normalized)) {
    normalized = `+${normalized}`;
    return normalized;
  }

  // Cannot safely normalize
  return null;
}

interface SendMessageRequest {
  to: string;
  body: string;
  phoneNumberId?: string;
  provider?: "twilio" | "blooio";
}

async function handleSendMessage(request: NextRequest): Promise<Response> {
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

    // Validate and normalize phone number to E.164 format
    const normalizedTo = normalizeToE164(to);
    if (!normalizedTo) {
      return NextResponse.json(
        {
          error: "Invalid phone number format. Please use E.164 format (e.g., +14155552671) or a 10-digit US number.",
          providedNumber: to,
        },
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
      // Use the specified phone number (must be active)
      const result = await dbRead
        .select()
        .from(agentPhoneNumbers)
        .where(
          and(
            eq(agentPhoneNumbers.id, phoneNumberId),
            eq(agentPhoneNumbers.organization_id, user.organization_id),
            eq(agentPhoneNumbers.is_active, true)
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
      to: normalizedTo,
      provider: fromPhoneNumber.provider,
      phoneNumberId: fromPhoneNumber.id,
    });

    let result: { success: boolean; messageId?: string; error?: string };

    if (fromPhoneNumber.provider === "twilio") {
      // Send via Twilio - map messageSid to messageId
      const twilioResult = await twilioAutomationService.sendMessage(
        user.organization_id,
        {
          to: normalizedTo,
          body: messageBody,
          from: fromPhoneNumber.phone_number,
        }
      );
      result = {
        success: twilioResult.success,
        messageId: twilioResult.messageSid,
        error: twilioResult.error,
      };
    } else if (fromPhoneNumber.provider === "blooio") {
      // Send via Blooio
      // For Blooio, we need a chat ID (phone number in E.164 format)
      result = await blooioAutomationService.sendMessage(
        user.organization_id,
        normalizedTo, // Use the normalized phone number as chat ID
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
      to: normalizedTo,
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

// Export POST handler with rate limiting
// Limits to MESSAGE_RATE_LIMIT requests per minute to prevent SMS spam
export const POST = withRateLimit(handleSendMessage, MESSAGE_RATE_LIMIT);
