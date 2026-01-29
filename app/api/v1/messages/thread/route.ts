/**
 * Message Thread API
 *
 * Gets all messages in a conversation thread for a specific phone number.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { dbRead } from "@/db/client";
import { phoneMessageLog, agentPhoneNumbers } from "@/db/schemas";
import { eq, and, or, asc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

/**
 * Safely parse JSON with fallback to null for malformed data
 */
function safeJsonParse(value: string): string[] | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/messages/thread
 * Get all messages in a conversation thread
 * Query params:
 *   - phoneNumber (required): The customer/counterparty phone number
 *   - phoneNumberId (optional): The agent phone number ID for disambiguation
 *   - counterparty (optional): Explicitly specify the other party (for bidirectional matching)
 *   - limit (optional): Max messages to return (default 100)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get("phoneNumber");
    const phoneNumberId = searchParams.get("phoneNumberId");
    const counterparty = searchParams.get("counterparty");
    const parsedLimit = parseInt(searchParams.get("limit") || "100", 10);
    const limit = Number.isNaN(parsedLimit) ? 100 : parsedLimit;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "phoneNumber query parameter is required" },
        { status: 400 }
      );
    }

    // Build where conditions
    const baseConditions = [
      eq(agentPhoneNumbers.organization_id, user.organization_id),
    ];

    if (phoneNumberId) {
      baseConditions.push(eq(agentPhoneNumbers.id, phoneNumberId));
    }

    // Build message filter conditions
    // If counterparty is provided, filter to messages between phoneNumber and counterparty
    // Otherwise, filter to messages where phoneNumber is involved (either as sender or recipient)
    let messageFilter;
    if (counterparty) {
      // Specific conversation: messages between phoneNumber and counterparty
      messageFilter = or(
        and(
          eq(phoneMessageLog.from_number, phoneNumber),
          eq(phoneMessageLog.to_number, counterparty)
        ),
        and(
          eq(phoneMessageLog.from_number, counterparty),
          eq(phoneMessageLog.to_number, phoneNumber)
        )
      );
    } else {
      // General filter: messages where phoneNumber is involved
      messageFilter = or(
        eq(phoneMessageLog.from_number, phoneNumber),
        eq(phoneMessageLog.to_number, phoneNumber)
      );
    }

    // Get messages for this conversation
    const messages = await dbRead
      .select({
        id: phoneMessageLog.id,
        direction: phoneMessageLog.direction,
        fromNumber: phoneMessageLog.from_number,
        toNumber: phoneMessageLog.to_number,
        body: phoneMessageLog.message_body,
        messageType: phoneMessageLog.message_type,
        status: phoneMessageLog.status,
        errorMessage: phoneMessageLog.error_message,
        agentResponse: phoneMessageLog.agent_response,
        responseTimeMs: phoneMessageLog.response_time_ms,
        providerMessageId: phoneMessageLog.provider_message_id,
        mediaUrls: phoneMessageLog.media_urls,
        createdAt: phoneMessageLog.created_at,
        respondedAt: phoneMessageLog.responded_at,
        agentId: agentPhoneNumbers.agent_id,
        provider: agentPhoneNumbers.provider,
        agentPhoneNumber: agentPhoneNumbers.phone_number,
      })
      .from(phoneMessageLog)
      .innerJoin(
        agentPhoneNumbers,
        eq(phoneMessageLog.phone_number_id, agentPhoneNumbers.id)
      )
      .where(
        and(
          ...baseConditions,
          messageFilter
        )
      )
      .orderBy(asc(phoneMessageLog.created_at))
      .limit(limit);

    // Get thread metadata
    const agentInfo = messages.length > 0 ? {
      agentId: messages[0].agentId,
      agentPhoneNumber: messages[0].agentPhoneNumber,
      provider: messages[0].provider,
    } : null;

    return NextResponse.json({
      success: true,
      phoneNumber,
      agentInfo,
      messages: messages.map((msg) => ({
        id: msg.id,
        direction: msg.direction,
        from: msg.fromNumber,
        to: msg.toNumber,
        body: msg.body,
        messageType: msg.messageType,
        status: msg.status,
        errorMessage: msg.errorMessage,
        agentResponse: msg.agentResponse,
        responseTimeMs: msg.responseTimeMs ? parseInt(msg.responseTimeMs, 10) : null,
        providerMessageId: msg.providerMessageId,
        mediaUrls: msg.mediaUrls ? safeJsonParse(msg.mediaUrls) : null,
        createdAt: msg.createdAt,
        respondedAt: msg.respondedAt,
      })),
      total: messages.length,
    });
  } catch (error) {
    logger.error("[Messages] Failed to get thread", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to get message thread" },
      { status: 500 }
    );
  }
}
