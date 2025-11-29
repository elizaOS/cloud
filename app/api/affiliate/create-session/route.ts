import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

// Schema validation for incoming request
const CreateSessionSchema = z.object({
  characterId: z.string().uuid(),
  source: z.string().optional(),
});

/**
 * Create Anonymous Session
 * 
 * POST /api/affiliate/create-session
 * 
 * Creates an anonymous session for users who want to try the chat
 * without signing up first.
 * 
 * Request Body:
 * {
 *   characterId: string (UUID),
 *   source?: string (affiliate source)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   sessionToken: string (UUID)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = CreateSessionSchema.safeParse(body);

    if (!validationResult.success) {
      logger.warn("[Create Session] Invalid request body:", validationResult.error.format());
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
    
    // Create a placeholder user ID for anonymous sessions
    // This maps to the anonymous-session-user in the system
    const anonymousUserId = `anon-${sessionToken}`;

    // Session expires in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Extract client info
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Create anonymous session
    await anonymousSessionsService.create({
      session_token: sessionToken,
      user_id: anonymousUserId,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      messages_limit: 10, // Free tier: 10 messages
    });

    logger.info(`[Create Session] Created anonymous session for character ${characterId}`, {
      sessionToken,
      source,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      sessionToken,
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


