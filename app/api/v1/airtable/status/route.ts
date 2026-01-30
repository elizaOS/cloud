/**
 * Airtable Status API
 *
 * Returns the connection status of Airtable for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { airtableAutomationService } from "@/lib/services/airtable-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const status = await airtableAutomationService.getConnectionStatus(
    user.organization_id
  );

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    email: status.email,
    userId: status.userId,
    error: status.error,
  });
}
