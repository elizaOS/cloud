/**
 * Airtable Bases API
 *
 * Returns list of bases the user has access to.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { airtableAutomationService } from "@/lib/services/airtable-automation";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const bases = await airtableAutomationService.listBases(
    user.organization_id
  );

  return NextResponse.json({ bases });
}
