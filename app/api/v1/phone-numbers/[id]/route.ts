/**
 * Phone Number by ID API
 *
 * Manage individual phone number mappings.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { messageRouterService } from "@/lib/services/message-router";
import { dbWrite } from "@/db/client";
import { agentPhoneNumbers } from "@/db/schemas";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/phone-numbers/[id]
 * Get a specific phone number mapping
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const phoneNumber = await messageRouterService.getPhoneNumberById(id);

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 },
      );
    }

    // Verify ownership
    if (phoneNumber.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      phoneNumber: {
        id: phoneNumber.id,
        phoneNumber: phoneNumber.phone_number,
        friendlyName: phoneNumber.friendly_name,
        provider: phoneNumber.provider,
        phoneType: phoneNumber.phone_type,
        agentId: phoneNumber.agent_id,
        webhookUrl: phoneNumber.webhook_url,
        isActive: phoneNumber.is_active,
        capabilities: {
          canSendSms: phoneNumber.can_send_sms,
          canReceiveSms: phoneNumber.can_receive_sms,
          canSendMms: phoneNumber.can_send_mms,
          canReceiveMms: phoneNumber.can_receive_mms,
          canVoice: phoneNumber.can_voice,
        },
        lastMessageAt: phoneNumber.last_message_at,
        createdAt: phoneNumber.created_at,
      },
    });
  } catch (error) {
    logger.error("[Phone Numbers] Failed to get phone number", {
      error: error instanceof Error ? error.message : String(error),
      phoneNumberId: id,
    });
    return NextResponse.json(
      { error: "Failed to get phone number" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/v1/phone-numbers/[id]
 * Update a phone number mapping (e.g., change agent)
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const body = await request.json();
    const { agentId, friendlyName, isActive, capabilities } = body;

    // Verify ownership first
    const phoneNumber = await messageRouterService.getPhoneNumberById(id);
    if (!phoneNumber || phoneNumber.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 },
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (agentId !== undefined) {
      updates.agent_id = agentId;
    }
    if (friendlyName !== undefined) {
      updates.friendly_name = friendlyName;
    }
    if (isActive !== undefined) {
      updates.is_active = isActive;
    }
    if (capabilities) {
      if (capabilities.canSendSms !== undefined) {
        updates.can_send_sms = capabilities.canSendSms;
      }
      if (capabilities.canReceiveSms !== undefined) {
        updates.can_receive_sms = capabilities.canReceiveSms;
      }
      if (capabilities.canSendMms !== undefined) {
        updates.can_send_mms = capabilities.canSendMms;
      }
      if (capabilities.canReceiveMms !== undefined) {
        updates.can_receive_mms = capabilities.canReceiveMms;
      }
      if (capabilities.canVoice !== undefined) {
        updates.can_voice = capabilities.canVoice;
      }
    }

    // Update in database
    await dbWrite
      .update(agentPhoneNumbers)
      .set(updates)
      .where(
        and(
          eq(agentPhoneNumbers.id, id),
          eq(agentPhoneNumbers.organization_id, user.organization_id),
        ),
      );

    logger.info("[Phone Numbers] Updated phone number", {
      phoneNumberId: id,
      updates: Object.keys(updates),
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      message: "Phone number updated successfully",
    });
  } catch (error) {
    logger.error("[Phone Numbers] Failed to update", {
      error: error instanceof Error ? error.message : String(error),
      phoneNumberId: id,
    });
    return NextResponse.json(
      { error: "Failed to update phone number" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/phone-numbers/[id]
 * Deactivate/remove a phone number mapping
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    // Verify ownership first
    const phoneNumber = await messageRouterService.getPhoneNumberById(id);
    if (!phoneNumber || phoneNumber.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 },
      );
    }

    // Deactivate the phone number (soft delete)
    await messageRouterService.deactivatePhoneNumber(id);

    logger.info("[Phone Numbers] Deactivated phone number", {
      phoneNumberId: id,
      phoneNumber: phoneNumber.phone_number,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      message: "Phone number deactivated successfully",
    });
  } catch (error) {
    logger.error("[Phone Numbers] Failed to delete", {
      error: error instanceof Error ? error.message : String(error),
      phoneNumberId: id,
    });
    return NextResponse.json(
      { error: "Failed to delete phone number" },
      { status: 500 },
    );
  }
}
