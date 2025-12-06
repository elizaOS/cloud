import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { users, anonymousSessions } from "@/db/schemas";
import { cookies } from "next/headers";

// Cookie name - must match auth-anonymous.ts
const ANON_SESSION_COOKIE = "eliza-anon-session";

// Get message limit from env or default
const ANON_MESSAGE_LIMIT = Number.parseInt(
  process.env.ANON_MESSAGE_LIMIT || "5",
  10
);

// Schema validation for incoming request
const CreateSessionSchema = z.object({
  characterId: z.string().uuid(),
  source: z.string().optional(),
});

/**
 * POST /api/affiliate/create-session
 * Creates an anonymous session for users to try chat without signing up.
 * Creates a real anonymous user in the database and sets a session cookie.
 *
 * @param request - Request body with characterId and optional source.
 * @returns Session token and user ID.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = CreateSessionSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn(
        "[Create Session] Invalid request body:",
        validationResult.error.format()
      );
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { characterId, source } = validationResult.data;

    // Generate session token
    const sessionToken = randomUUID();

    // Session expires in 7 days (matching auth-anonymous.ts)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Extract client info
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    // Use transaction to ensure consistency - if session creation fails,
    // the user creation is rolled back (no orphaned users)
    const result = await db.transaction(async (tx) => {
      // Create a REAL anonymous user in the database
      const [newUser] = await tx
        .insert(users)
        .values({
          is_anonymous: true,
          anonymous_session_id: sessionToken,
          organization_id: null, // No org for anonymous users
          is_active: true,
          expires_at: expiresAt,
          role: "member",
        })
        .returning();

      logger.info(`[Create Session] Created anonymous user: ${newUser.id}`);

      // Create anonymous session linked to the real user
      const [newSession] = await tx
        .insert(anonymousSessions)
        .values({
          session_token: sessionToken,
          user_id: newUser.id,
          expires_at: expiresAt,
          ip_address: ipAddress,
          user_agent: userAgent,
          messages_limit: ANON_MESSAGE_LIMIT,
        })
        .returning();

      return { user: newUser, session: newSession };
    });

    // Set the session cookie so getAnonymousUser() can find this user
    // Only set cookie AFTER successful transaction
    const cookieStore = await cookies();
    cookieStore.set(ANON_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict", // Prevent CSRF attacks
      path: "/",
      expires: expiresAt,
    });

    logger.info(
      `[Create Session] Created anonymous session for character ${characterId}`,
      {
        userId: result.user.id,
        source,
      }
    );

    return NextResponse.json({
      success: true,
      sessionToken,
      userId: result.user.id,
    });
  } catch (error) {
    logger.error("[Create Session] Error creating session:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create session",
      },
      { status: 500 }
    );
  }
}
