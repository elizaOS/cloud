/**
 * Phone Numbers API
 *
 * Manages phone number to agent mappings for SMS/iMessage routing.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { messageRouterService } from "@/lib/services/message-router";
import { logger } from "@/lib/utils/logger";
import type { AgentPhoneNumber } from "@/db/schemas";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/phone-numbers
 * List all phone numbers for the organization
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const phoneNumbers = await messageRouterService.getPhoneNumbers(
      user.organization_id,
    );

    return NextResponse.json({
      success: true,
      phoneNumbers: phoneNumbers.map((pn: AgentPhoneNumber) => ({
        id: pn.id,
        phoneNumber: pn.phone_number,
        friendlyName: pn.friendly_name,
        provider: pn.provider,
        phoneType: pn.phone_type,
        agentId: pn.agent_id,
        webhookUrl: pn.webhook_url,
        isActive: pn.is_active,
        capabilities: {
          canSendSms: pn.can_send_sms,
          canReceiveSms: pn.can_receive_sms,
          canSendMms: pn.can_send_mms,
          canReceiveMms: pn.can_receive_mms,
          canVoice: pn.can_voice,
        },
        lastMessageAt: pn.last_message_at,
        createdAt: pn.created_at,
      })),
    });
  } catch (error) {
    logger.error("[Phone Numbers] Failed to list", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to list phone numbers" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/phone-numbers
 * Register a new phone number mapping
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = await request.json();
    const {
      phoneNumber,
      agentId,
      provider,
      phoneType,
      friendlyName,
      capabilities,
    } = body;

    if (!phoneNumber || !agentId || !provider) {
      return NextResponse.json(
        { error: "Phone number, agent ID, and provider are required" },
        { status: 400 },
      );
    }

    // Validate provider
    if (!["twilio", "blooio"].includes(provider)) {
      return NextResponse.json(
        { error: "Provider must be 'twilio' or 'blooio'" },
        { status: 400 },
      );
    }

    // Validate that agent belongs to the user's organization
    const [agent] = await dbRead
      .select({ id: apps.id })
      .from(apps)
      .where(
        and(
          eq(apps.id, agentId),
          eq(apps.organization_id, user.organization_id),
        ),
      )
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found or does not belong to your organization" },
        { status: 400 },
      );
    }

    // Register the phone number
    const result = await messageRouterService.registerPhoneNumber({
      organizationId: user.organization_id,
      agentId,
      phoneNumber,
      provider,
      phoneType: phoneType || (provider === "blooio" ? "imessage" : "sms"),
      friendlyName,
      capabilities,
    });

    logger.info("[Phone Numbers] Registered new phone number", {
      phoneNumberId: result.id,
      phoneNumber,
      agentId,
      provider,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      id: result.id,
      webhookUrl: result.webhookUrl,
      message: "Phone number registered successfully",
    });
  } catch (error) {
    logger.error("[Phone Numbers] Failed to register", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });
    return NextResponse.json(
      { error: "Failed to register phone number" },
      { status: 500 },
    );
  }
}
