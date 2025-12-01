import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

const ANON_SESSION_COOKIE = "eliza-anon-session";

/**
 * POST /api/set-anonymous-session
 *
 * Sets the anonymous session cookie when a user arrives with a session token from the affiliate API.
 * This is necessary because the affiliate API creates the session server-side,
 * but the cookie needs to be set in the user's browser.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken } = body;

    if (!sessionToken || typeof sessionToken !== "string") {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 },
      );
    }

    // Validate that the session exists and is active
    const session = await anonymousSessionsService.getByToken(sessionToken);

    if (!session) {
      logger.warn(
        "[Set Session] Invalid session token provided:",
        sessionToken.substring(0, 8) + "...",
      );
      return NextResponse.json(
        { error: "Invalid session token" },
        { status: 404 },
      );
    }

    // Check if session is expired
    if (session.expires_at < new Date()) {
      logger.warn("[Set Session] Expired session token:", session.id);
      return NextResponse.json(
        { error: "Session has expired" },
        { status: 410 },
      );
    }

    // Set the cookie
    const cookieStore = await cookies();
    cookieStore.set(ANON_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expires_at,
    });

    logger.info("[Set Session] Successfully set anonymous session cookie", {
      sessionId: session.id,
      expiresAt: session.expires_at,
    });

    return NextResponse.json({
      success: true,
      message: "Session cookie set successfully",
    });
  } catch (error) {
    logger.error("[Set Session] Error setting session cookie:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
