import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
import { roomsService } from "@/lib/services/agents/rooms";
import { anonymousSessionsService, usersService } from "@/lib/services";

/**
 * GET /api/eliza/rooms - Get user's rooms with last message preview
 *
 * Single optimized query - no runtime needed
 * Returns rooms sorted by most recent activity
 *
 * Security: entityId is derived from authenticated user, not client-supplied
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string;

    try {
      const authResult = await requireAuthOrApiKey(request);
      userId = authResult.user.id;
      logger.debug("[Eliza Rooms API GET] Authenticated user:", userId);
    } catch {
      const anonData = await getAnonymousUser();
      if (!anonData) {
        return NextResponse.json({
          success: true,
          rooms: [],
        });
      }
      userId = anonData.user.id;
      logger.debug("[Eliza Rooms API GET] Anonymous user:", userId);
    }

    const rooms = await roomsService.getRoomsForEntity(userId);

    logger.debug(
      `[Eliza Rooms API] Returning ${rooms.length} rooms for user ${userId}`
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
      { status: 500 }
    );
  }
}

/**
 * POST /api/eliza/rooms - Create new room
 *
 * Minimal room creation - just creates room record in database
 * The runtime will handle entity/participant setup when first message is sent
 * via ensureConnection in message-handler.ts
 *
 * Security: entityId is derived from authenticated user, not client-supplied
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterId, sessionToken: bodySessionToken } = body;

    const headerSessionToken = request.headers.get("X-Anonymous-Session");
    const providedSessionToken = headerSessionToken || bodySessionToken;

    let userId: string | undefined;

    try {
      const authResult = await requireAuthOrApiKey(request);
      userId = authResult.user.id;
      logger.info("[Eliza Rooms API POST] Authenticated via Privy:", userId);
    } catch (authError) {
      logger.info(
        "[Eliza Rooms API POST] Privy auth failed, trying anonymous...",
        authError instanceof Error ? authError.message : "Unknown error"
      );

      if (providedSessionToken) {
        logger.info(
          "[Eliza Rooms API POST] Checking provided session token:",
          providedSessionToken.slice(0, 8) + "..."
        );
        const session =
          await anonymousSessionsService.getByToken(providedSessionToken);
        if (session) {
          const sessionUser = await usersService.getById(session.user_id);
          if (sessionUser && sessionUser.is_anonymous) {
            userId = sessionUser.id;
            logger.info(
              "[Eliza Rooms API POST] Anonymous auth via provided token:",
              userId
            );
          }
        }
      }

      if (!userId) {
        const anonData = await getAnonymousUser();

        if (anonData) {
          userId = anonData.user.id;
          logger.info(
            "[Eliza Rooms API POST] Anonymous auth via cookie:",
            userId
          );
        } else {
          logger.info(
            "[Eliza Rooms API POST] No session cookie - creating new anonymous session"
          );

          try {
            const newAnonData = await getOrCreateAnonymousUser();
            userId = newAnonData.user.id;
            logger.info(
              "[Eliza Rooms API POST] Created new anonymous session:",
              userId
            );
          } catch (createError) {
            logger.error(
              "[Eliza Rooms API POST] Failed to create anonymous session:",
              createError instanceof Error
                ? createError.message
                : "Unknown error"
            );
            throw new Error(
              "Authentication required - failed to create anonymous session"
            );
          }
        }
      }
    }

    logger.info(
      "[Eliza Rooms API POST] Creating room for user:",
      userId,
      "| characterId:",
      characterId || "default"
    );

    if (characterId && typeof characterId !== "string") {
      logger.error(
        "[Eliza Rooms API POST] Invalid characterId type:",
        typeof characterId
      );
      return NextResponse.json(
        { error: "characterId must be a string" },
        { status: 400 }
      );
    }

    const roomId = uuidv4();
    const createdAt = Date.now();

    await roomsService.createRoom({
      id: roomId,
      agentId: characterId || undefined,
      entityId: userId!,
      source: "web",
      type: "DM",
      metadata: {
        createdAt,
      },
    });

    logger.info(
      "[Eliza Rooms API POST] Room created:",
      roomId,
      "for user:",
      userId
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
      error instanceof Error ? error.stack : error
    );
    return NextResponse.json(
      {
        error: "Failed to create room",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
