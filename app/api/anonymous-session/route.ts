import { NextRequest, NextResponse } from "next/server";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/anonymous-session - Get anonymous session data by token
 * 
 * This endpoint allows the frontend to poll for updated session info,
 * particularly the message_count which is incremented on the backend.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    logger.info("[Anonymous Session API] 📊 GET request received:", {
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 8) + "..." : "N/A",
    });

    if (!token) {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    const session = await anonymousSessionsService.getByToken(token);

    if (!session) {
      logger.warn("[Anonymous Session API] ⚠️ Session not found for token:", token.slice(0, 8) + "...");
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    logger.info("[Anonymous Session API] ✅ Returning session data:", {
      sessionId: session.id,
      messageCount: session.message_count,
      messagesLimit: session.messages_limit,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        message_count: session.message_count,
        messages_limit: session.messages_limit,
        messages_remaining: session.messages_limit - session.message_count,
        is_active: session.is_active,
        expires_at: session.expires_at,
      },
    });
  } catch (error) {
    logger.error("[Anonymous Session API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get session data" },
      { status: 500 }
    );
  }
}

