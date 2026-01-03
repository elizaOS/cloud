import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";

/**
 * GET /api/v1/app-builder/sessions/[sessionId]/history
 * 
 * Get version history (git commits) for an app session.
 * Replaces the old snapshots endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = params;
    
    const history = await aiAppBuilder.getVersionHistory(sessionId, session.user.id);

    return NextResponse.json({
      commits: history,
      total: history.length,
    });
  } catch (error) {
    console.error("[app-builder/history] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get history" },
      { status: 500 }
    );
  }
}
