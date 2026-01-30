/**
 * WhatsApp Connect API
 *
 * Configures WhatsApp messaging using an existing Twilio connection.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "WhatsApp-enabled phone number is required" },
        { status: 400 }
      );
    }

    // Validate phone number format (should be E.164)
    const normalizedNumber = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;

    if (!/^\+[1-9]\d{6,14}$/.test(normalizedNumber)) {
      return NextResponse.json(
        { error: "Invalid phone number format. Use E.164 format (e.g., +14155551234)" },
        { status: 400 }
      );
    }

    // Check if Twilio is connected
    const twilioConnected = await whatsappAutomationService.isTwilioConfigured(
      user.organization_id
    );

    if (!twilioConnected) {
      return NextResponse.json(
        { error: "Twilio must be connected first before enabling WhatsApp" },
        { status: 400 }
      );
    }

    // Store WhatsApp configuration
    await whatsappAutomationService.storeCredentials(
      user.organization_id,
      user.id,
      normalizedNumber
    );

    return NextResponse.json({
      success: true,
      phoneNumber: normalizedNumber,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to connect WhatsApp",
      },
      { status: 500 }
    );
  }
}
