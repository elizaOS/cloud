import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    await aiAppBuilderService.verifySessionOwnership(sessionId, user.id);

    const url = new URL(request.url);
    const rawTail = parseInt(url.searchParams.get("tail") || "50", 10);
    const tail = Math.min(Math.max(isNaN(rawTail) ? 50 : rawTail, 1), 1000);

    const logs = await aiAppBuilderService.getLogs(sessionId, user.id, tail);

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    logger.error("Failed to get session logs", { error });
    const message =
      error instanceof Error ? error.message : "Failed to get logs";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
        ? 404
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
