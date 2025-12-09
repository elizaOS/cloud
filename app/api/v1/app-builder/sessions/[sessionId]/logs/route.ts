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
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const url = new URL(request.url);
    const tail = parseInt(url.searchParams.get("tail") || "50", 10);

    const logs = await aiAppBuilderService.getLogs(sessionId, tail);

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    logger.error("Failed to get session logs", { error });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get logs" },
      { status: 500 }
    );
  }
}
