/**
 * Messages API
 *
 * Lists conversations grouped by phone number for the messaging center.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { dbRead } from "@/db/client";
import { phoneMessageLog, agentPhoneNumbers } from "@/db/schemas";
import { eq, desc, sql, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/messages
 * List all conversations grouped by phone number
 * Query params: agentId, provider, status, limit, offset
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const provider = searchParams.get("provider");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build where conditions
    const conditions = [eq(agentPhoneNumbers.organization_id, user.organization_id)];
    
    if (agentId) {
      conditions.push(eq(agentPhoneNumbers.agent_id, agentId));
    }
    
    if (provider && (provider === "twilio" || provider === "blooio")) {
      conditions.push(eq(agentPhoneNumbers.provider, provider));
    }

    // Get conversations grouped by from_number with latest message
    const conversations = await dbRead
      .select({
        fromNumber: phoneMessageLog.from_number,
        toNumber: phoneMessageLog.to_number,
        agentId: agentPhoneNumbers.agent_id,
        provider: agentPhoneNumbers.provider,
        phoneNumberId: agentPhoneNumbers.id,
        friendlyName: agentPhoneNumbers.friendly_name,
        messageCount: sql<number>`count(*)::int`,
        lastMessageAt: sql<string>`max(${phoneMessageLog.created_at})`,
        lastMessage: sql<string>`(
          SELECT message_body FROM phone_message_log pml2 
          WHERE pml2.from_number = ${phoneMessageLog.from_number} 
          AND pml2.phone_number_id = ${phoneMessageLog.phone_number_id}
          ORDER BY pml2.created_at DESC LIMIT 1
        )`,
        lastDirection: sql<string>`(
          SELECT direction FROM phone_message_log pml3 
          WHERE pml3.from_number = ${phoneMessageLog.from_number} 
          AND pml3.phone_number_id = ${phoneMessageLog.phone_number_id}
          ORDER BY pml3.created_at DESC LIMIT 1
        )`,
        failedCount: sql<number>`count(*) filter (where ${phoneMessageLog.status} = 'failed')::int`,
      })
      .from(phoneMessageLog)
      .innerJoin(
        agentPhoneNumbers,
        eq(phoneMessageLog.phone_number_id, agentPhoneNumbers.id)
      )
      .where(and(...conditions))
      .groupBy(
        phoneMessageLog.from_number,
        phoneMessageLog.to_number,
        phoneMessageLog.phone_number_id,
        agentPhoneNumbers.agent_id,
        agentPhoneNumbers.provider,
        agentPhoneNumbers.id,
        agentPhoneNumbers.friendly_name
      )
      .orderBy(desc(sql`max(${phoneMessageLog.created_at})`))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    // Count distinct conversation groups (from_number + phone_number_id combinations)
    // to match the GROUP BY clause in the main query
    const totalResult = await dbRead
      .select({
        count: sql<number>`count(distinct (${phoneMessageLog.from_number}, ${phoneMessageLog.phone_number_id}))::int`,
      })
      .from(phoneMessageLog)
      .innerJoin(
        agentPhoneNumbers,
        eq(phoneMessageLog.phone_number_id, agentPhoneNumbers.id)
      )
      .where(and(...conditions));

    const total = totalResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      conversations: conversations.map((conv) => ({
        phoneNumber: conv.fromNumber,
        toNumber: conv.toNumber,
        agentId: conv.agentId,
        provider: conv.provider,
        phoneNumberId: conv.phoneNumberId,
        friendlyName: conv.friendlyName,
        lastMessage: conv.lastMessage,
        lastDirection: conv.lastDirection,
        lastMessageAt: conv.lastMessageAt,
        totalMessages: conv.messageCount,
        failedCount: conv.failedCount,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[Messages] Failed to list conversations", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}
