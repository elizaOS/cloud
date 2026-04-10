import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladyGatewayRelayService } from "@/lib/services/milady-gateway-relay";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;
    const session = await miladyGatewayRelayService.getSession(sessionId);

    if (session) {
      if (session.organizationId !== user.organization_id || session.userId !== user.id) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      await miladyGatewayRelayService.disconnectSession(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
