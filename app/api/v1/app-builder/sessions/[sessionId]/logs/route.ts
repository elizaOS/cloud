import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/app-builder/sessions/:sessionId/logs
 * Get console logs from the sandbox
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    // Verify user owns this session
    await aiAppBuilderService.verifySessionOwnership(sessionId, user.id);

    const url = new URL(request.url);
    const tail = parseInt(url.searchParams.get("tail") || "50", 10);

    const logs = await aiAppBuilderService.getLogs(sessionId, tail);

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
