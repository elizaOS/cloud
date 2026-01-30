/**
 * Notion Disconnect API
 *
 * Removes Notion credentials for the organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { notionAutomationService } from "@/lib/services/notion-automation";

export const maxDuration = 30;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  await notionAutomationService.removeCredentials(
    user.organization_id,
    user.id
  );

  return NextResponse.json({ success: true });
}
