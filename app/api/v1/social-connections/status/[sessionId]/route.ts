import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService } from "@/lib/services/platform-credentials";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const status = await platformCredentialsService.getSessionStatus(sessionId);

  if (status.status === "not_found") {
    return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    status: status.status,
    credentialId: status.credentialId,
    error: status.error,
  });
}
