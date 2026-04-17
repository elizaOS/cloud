import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladyGatewayRelayService } from "@/lib/services/milady-gateway-relay";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseTimeoutMs(request: NextRequest): number {
  const raw = new URL(request.url).searchParams.get("timeoutMs");
  const parsed = raw ? Number.parseInt(raw, 10) : 25_000;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25_000;
  }
  return Math.min(parsed, 25_000);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;
    const session = await miladyGatewayRelayService.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    if (
      session.organizationId !== user.organization_id ||
      session.userId !== user.id
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const requestEnvelope = await miladyGatewayRelayService.pollNextRequest(
      sessionId,
      parseTimeoutMs(request),
    );

    return NextResponse.json({
      success: true,
      data: {
        request: requestEnvelope,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
