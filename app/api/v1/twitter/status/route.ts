import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { twitterAutomationService } from "@/lib/services/twitter-automation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const role = request.nextUrl.searchParams.get("connectionRole") === "agent" ? "agent" : "owner";
  const connectionId = `twitter:${user.organization_id}:${role}`;

  if (!twitterAutomationService.isConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      connectionRole: role,
      connectionId: null,
    });
  }

  const status = await twitterAutomationService.getConnectionStatus(user.organization_id, role);

  return NextResponse.json({
    configured: true,
    connectionRole: role,
    connectionId: status.connected ? connectionId : null,
    ...status,
  });
}
