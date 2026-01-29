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
 * Query params: phoneNumber (required), phoneNumberId (optional for disambiguation)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get("phoneNumber");
    const phoneNumberId = searchParams.get("phoneNumberId");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "phoneNumber query parameter is required" },
        { status: 400 }
      );
    }

    // Build where conditions - match messages where the phone number is either sender or recipient
    const baseConditions = [
      eq(agentPhoneNumbers.organization_id, user.organization_id),
    ];

    if (phoneNumberId) {
      baseConditions.push(eq(agentPhoneNumbers.id, phoneNumberId));
    }

    // Get messages where this phone number is involved (either as sender or in the to field)
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
          or(
            eq(phoneMessageLog.from_number, phoneNumber),
            eq(phoneMessageLog.to_number, phoneNumber)
          )
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
