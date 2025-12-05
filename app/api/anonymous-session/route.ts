import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { createHash } from "node:crypto";

/**
 * Hash a token for safe logging (prevents partial token exposure)
 */
function hashTokenForLogging(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

/**
 * Validate session token format
 * Session tokens should be at least 16 characters (nanoid or UUID format)
 */
function isValidTokenFormat(token: string): boolean {
  return typeof token === "string" && token.length >= 16 && token.length <= 64;
}

/**
 * GET /api/anonymous-session - Get anonymous session data by token
 *
 * This endpoint allows the frontend to poll for updated session info,
 * particularly the message_count which is incremented on the backend.
 *
 * Security:
 * - Validates token format before database query
 * - Hashes tokens for logging (prevents exposure)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // Input validation
    if (!token) {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    if (!isValidTokenFormat(token)) {
      logger.warn("[Anonymous Session API] Invalid token format");
      return NextResponse.json(
        { error: "Invalid session token format" },
        { status: 400 }
      );
    }

    const tokenHash = hashTokenForLogging(token);
    logger.info("[Anonymous Session API] GET request received:", {
      tokenHash,
    });

    const session = await anonymousSessionsService.getByToken(token);

    if (!session) {
      logger.warn(
        `[Anonymous Session API] Session not found for token hash: ${tokenHash}`
      );
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    logger.info("[Anonymous Session API] Returning session data:", {
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
