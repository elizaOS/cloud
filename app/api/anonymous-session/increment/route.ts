import { NextRequest, NextResponse } from "next/server";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

/**
 * POST /api/anonymous-session/increment
 * 
 * Directly increment the message count for an anonymous session.
 * This is called by the frontend after a message is successfully sent.
 * 
 * This provides a reliable fallback mechanism for message counting,
 * bypassing any potential issues in the complex auth flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken } = body;

    if (!sessionToken || typeof sessionToken !== "string") {
      logger.warn("[Increment API] Missing or invalid session token");
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    logger.info("[Increment API] 📊 Incrementing message count for token:", sessionToken.slice(0, 8) + "...");

    // Look up the session by token (without is_active/expires_at filters for robustness)
    const sessions = await db.execute<{ id: string; message_count: number }>(
      sql`SELECT id, message_count FROM anonymous_sessions WHERE session_token = ${sessionToken} LIMIT 1`
    );

    if (sessions.rows.length === 0) {
      logger.warn("[Increment API] ⚠️ Session not found for token:", sessionToken.slice(0, 8) + "...");
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const session = sessions.rows[0];
    const previousCount = session.message_count;

    // Increment the message count
    const updatedSession = await anonymousSessionsService.incrementMessageCount(session.id);

    logger.info("[Increment API] ✅ Message count incremented:", {
      sessionId: session.id,
      previousCount,
      newCount: updatedSession.message_count,
    });

    return NextResponse.json({
      success: true,
      previousCount,
      newCount: updatedSession.message_count,
      messagesRemaining: updatedSession.messages_limit - updatedSession.message_count,
    });
  } catch (error) {
    logger.error("[Increment API] ❌ Error incrementing message count:", error);
    return NextResponse.json(
      { 
        error: "Failed to increment message count",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

