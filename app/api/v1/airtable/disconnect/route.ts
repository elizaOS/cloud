/**
 * Airtable Disconnect API
 *
 * Removes Airtable credentials for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { airtableAutomationService } from "@/lib/services/airtable-automation";

export const maxDuration = 30;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  await airtableAutomationService.removeCredentials(
    user.organization_id,
    user.id
  );

  return NextResponse.json({ success: true });
}
