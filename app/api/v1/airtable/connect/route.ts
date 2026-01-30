/**
 * Airtable Connect API
 *
 * Connects Airtable using a Personal Access Token.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { airtableAutomationService } from "@/lib/services/airtable-automation";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const body = await request.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Personal Access Token is required" },
        { status: 400 }
      );
    }

    // Validate the token
    const validation = await airtableAutomationService.validateToken(accessToken);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid token" },
        { status: 400 }
      );
    }

    // Store credentials
    await airtableAutomationService.storeCredentials(
      user.organization_id,
      user.id,
      {
        accessToken,
        email: validation.email,
        airtableUserId: validation.userId,
      }
    );

    return NextResponse.json({
      success: true,
      email: validation.email,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to connect Airtable",
      },
      { status: 500 }
    );
  }
}
