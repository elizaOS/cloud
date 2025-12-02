import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { anonymousSessionsService, usersService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { users } from "@/db/schemas";

const ANON_SESSION_COOKIE = "eliza-anon-session";

/**
 * POST /api/set-anonymous-session
 *
 * Sets the anonymous session cookie when a user arrives with a session token from the affiliate API.
 * This is necessary because the affiliate API creates the session server-side,
 * but the cookie needs to be set in the user's browser.
 * This is a PUBLIC endpoint - no authentication required.
 */
export async function POST(request: NextRequest) {
  logger.info("[Set Session] Received request to set anonymous session cookie");
  
  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.error("[Set Session] Failed to parse request body:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { sessionToken } = body;

    if (!sessionToken || typeof sessionToken !== "string") {
      logger.warn("[Set Session] Missing or invalid session token in request");
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 },
      );
    }

    logger.info("[Set Session] Looking up session:", sessionToken.substring(0, 8) + "...");

    // Validate that the session exists
    const session = await anonymousSessionsService.getByToken(sessionToken);

    if (!session) {
      logger.warn(
        "[Set Session] Session not found for token:",
        sessionToken.substring(0, 8) + "...",
      );
      return NextResponse.json(
        { error: "Invalid session token", code: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    logger.info("[Set Session] Session found:", { 
      sessionId: session.id, 
      userId: session.user_id,
      expiresAt: session.expires_at 
    });

    // Check if session is expired
    if (session.expires_at < new Date()) {
      logger.warn("[Set Session] Session expired:", session.id);
      return NextResponse.json(
        { error: "Session has expired", code: "SESSION_EXPIRED" },
        { status: 410 },
      );
    }

    // Check if the user exists (handles old-style sessions with placeholder user_id)
    let user = await usersService.getById(session.user_id);
    
    if (!user) {
      // User doesn't exist - create a real anonymous user
      logger.info("[Set Session] User not found, creating anonymous user for session:", session.id);
      
      try {
        const [newUser] = await db
          .insert(users)
          .values({
            is_anonymous: true,
            anonymous_session_id: sessionToken,
            organization_id: null,
            is_active: true,
            expires_at: session.expires_at,
            role: "member",
          })
          .returning();

        // Update the session to point to the real user
        await db.execute`
          UPDATE anonymous_sessions 
          SET user_id = ${newUser.id} 
          WHERE id = ${session.id}
        `;

        user = newUser;
        logger.info("[Set Session] Created anonymous user:", newUser.id);
      } catch (dbError) {
        logger.error("[Set Session] Failed to create anonymous user:", dbError);
        return NextResponse.json(
          { error: "Failed to create user", code: "USER_CREATE_FAILED" },
          { status: 500 }
        );
      }
    }

    // Set the cookie
    try {
      const cookieStore = await cookies();
      cookieStore.set(ANON_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: session.expires_at,
      });
      logger.info("[Set Session] Cookie set successfully");
    } catch (cookieError) {
      logger.error("[Set Session] Failed to set cookie:", cookieError);
      // Continue anyway - the session is valid, just cookie setting failed
    }

    logger.info("[Set Session] ✅ Successfully processed session", {
      sessionId: session.id,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: "Session cookie set successfully",
      userId: user.id,
      sessionId: session.id,
    });
  } catch (error) {
    logger.error("[Set Session] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
