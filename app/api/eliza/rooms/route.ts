import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, getOrCreateAnonymousUser } from "@/lib/auth-anonymous";
import { roomsService } from "@/lib/services/agents/rooms";
import { anonymousSessionsService, usersService } from "@/lib/services";

/**
 * GET /api/eliza/rooms
 * Gets all rooms for the authenticated or anonymous user with last message preview.
 * Returns rooms sorted by most recent activity.
 *
 * @param request - The Next.js request object.
 * @returns Array of rooms with last message preview.
 */
export async function GET(request: NextRequest) {
  try {
    // Support both authenticated and anonymous users
    let userId: string;

    try {
      const authResult = await requireAuthOrApiKey(request);
      userId = authResult.user.id;
      logger.debug("[Eliza Rooms API GET] Authenticated user:", userId);
    } catch {
      // Fallback to anonymous user
      const anonData = await getAnonymousUser();
      if (!anonData) {
        // No anonymous session - return empty rooms (don't create session for GET)
        return NextResponse.json({
          success: true,
          rooms: [],
        });
      }
      userId = anonData.user.id;
      logger.debug("[Eliza Rooms API GET] Anonymous user:", userId);
    }

    // Single optimized query: rooms + last message for each room
    const rooms = await roomsService.getRoomsForEntity(userId);

    logger.debug(
      `[Eliza Rooms API] Returning ${rooms.length} rooms for user ${userId}`,
    );

    return NextResponse.json({
      success: true,
      rooms,
    });
  } catch (error) {
    logger.error("[Eliza Rooms API] Error getting rooms:", error);
    return NextResponse.json(
      {
        error: "Failed to get rooms",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/eliza/rooms
 * Creates a new chat room for the authenticated or anonymous user.
 * Supports both authenticated and anonymous users via session tokens.
 *
 * @param request - Request body with characterId and optional sessionToken.
 * @returns Created room ID, character ID, and creation timestamp.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterId, sessionToken: bodySessionToken } = body;

    // Also check header for session token (anonymous users)
    const headerSessionToken = request.headers.get("X-Anonymous-Session");
    const providedSessionToken = headerSessionToken || bodySessionToken;

    // Support both authenticated and anonymous users
    let userId: string;

    try {
      const authResult = await requireAuthOrApiKey(request);
      userId = authResult.user.id;
      logger.info("[Eliza Rooms API POST] Authenticated via Privy:", userId);
    } catch (authError) {
      // Fallback to anonymous user
      logger.info(
        "[Eliza Rooms API POST] Privy auth failed, trying anonymous...",
        authError instanceof Error ? authError.message : "Unknown error",
      );

      // First try the provided session token (from URL/body)
      // This ensures we don't overwrite the session created by /api/affiliate/create-session
      if (providedSessionToken) {
        logger.info(
          "[Eliza Rooms API POST] Checking provided session token:",
          providedSessionToken.slice(0, 8) + "...",
        );
        const session =
          await anonymousSessionsService.getByToken(providedSessionToken);
        if (session) {
          const sessionUser = await usersService.getById(session.user_id);
          if (sessionUser && sessionUser.is_anonymous) {
            userId = sessionUser.id;
            logger.info(
              "[Eliza Rooms API POST] Anonymous auth via provided token:",
              userId,
            );
          }
        }
      }

      // If provided token didn't work, try the cookie
      if (!userId) {
        const anonData = await getAnonymousUser();

        if (anonData) {
          userId = anonData.user.id;
          logger.info(
            "[Eliza Rooms API POST] Anonymous auth via cookie:",
            userId,
          );
        } else {
          // No cookie found - create a new anonymous session
          logger.info(
            "[Eliza Rooms API POST] No session cookie - creating new anonymous session",
          );

          try {
            const newAnonData = await getOrCreateAnonymousUser();
            userId = newAnonData.user.id;
            logger.info(
              "[Eliza Rooms API POST] Created new anonymous session:",
              userId,
            );
          } catch (createError) {
            logger.error(
              "[Eliza Rooms API POST] Failed to create anonymous session:",
              createError instanceof Error
                ? createError.message
                : "Unknown error",
            );
            throw new Error(
              "Authentication required - failed to create anonymous session",
            );
          }
        }
      }
    }

    logger.info(
      "[Eliza Rooms API POST] Creating room for user:",
      userId,
      "| characterId:",
      characterId || "default",
    );

    // Validate characterId if provided
    if (characterId && typeof characterId !== "string") {
      logger.error(
        "[Eliza Rooms API POST] Invalid characterId type:",
        typeof characterId,
      );
      return NextResponse.json(
        { error: "characterId must be a string" },
        { status: 400 },
      );
    }

    // Create room via service (pure DB operation)
    const roomId = uuidv4();
    const createdAt = Date.now();

    await roomsService.createRoom({
      id: roomId,
      agentId: characterId || undefined, // Single source of truth for character/agent ID
      entityId: userId, // User's ID (from auth)
      source: "web",
      type: "DM",
      metadata: {
        createdAt,
      },
    });

    logger.info(
      "[Eliza Rooms API POST] ✓ Room created:",
      roomId,
      "for user:",
      userId,
    );

    return NextResponse.json({
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt,
    });
  } catch (error) {
    logger.error(
      "[Eliza Rooms API POST] Error creating room:",
      error instanceof Error ? error.stack : error,
    );
    return NextResponse.json(
      {
        error: "Failed to create room",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
