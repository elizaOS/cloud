import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { invalidateOAuthState } from "@/lib/services/oauth/invalidation";
import { twitterAutomationService } from "@/lib/services/twitter-automation";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  await twitterAutomationService.removeCredentials(user.organization_id, user.id);

  await invalidateOAuthState(user.organization_id, "twitter", user.id);

  return NextResponse.json({ success: true });
}
