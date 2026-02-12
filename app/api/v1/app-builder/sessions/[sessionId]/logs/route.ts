import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { AuthenticationError, ForbiddenError } from "@/lib/api/errors";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(request);
    user = authResult.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 },
      );
    }
    logger.error("[App Builder] Logs GET auth error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
  const { sessionId } = await params;

  await aiAppBuilder.verifySessionOwnership(sessionId, user.id);

  const url = new URL(request.url);
  const rawTail = parseInt(url.searchParams.get("tail") || "50", 10);
  const tail = Math.min(Math.max(isNaN(rawTail) ? 50 : rawTail, 1), 1000);

  const logs = await aiAppBuilder.getLogs(sessionId, user.id, tail);

  return NextResponse.json({
    success: true,
    logs,
  });
}
