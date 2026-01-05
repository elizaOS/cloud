import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const history = await aiAppBuilder.getVersionHistory(sessionId, user.id);

    return NextResponse.json({
      success: true,
      commits: history,
      total: history.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get history";
    const status =
      message.includes("Unauthorized") || message.includes("Authentication")
        ? 401
        : message.includes("Access denied") || message.includes("don't own")
          ? 403
          : message.includes("not found")
            ? 404
            : 500;

    logger.error("Failed to get session history", { error: message });

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
