import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import { roomsService } from "@/lib/services/agents/rooms";

/**
 * GET /api/eliza/rooms - Get user's rooms with last message preview
 * 
 * Single optimized query - no runtime needed
 * Returns rooms sorted by most recent activity
 */
export async function GET(request: NextRequest) {
  try {
    // Support both authenticated and anonymous users
    let user;
    try {
      const authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
    } catch (error) {
      // Fallback to anonymous user
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }
      user = anonData.user;
    }

    // Use authenticated user's ID as entityId
    const entityId = user.id;

    // Single query: rooms + last message for each room
    const rooms = await roomsService.getRoomsForEntity(entityId);

    logger.debug(
      `[Eliza Rooms API] Returning ${rooms.length} rooms for entity ${entityId}`,
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
 * POST /api/eliza/rooms - Create new room
 * 
 * Minimal room creation - just creates room record in database
 * The runtime will handle entity/participant setup when first message is sent
 * via ensureConnection in message-handler.ts
 */
export async function POST(request: NextRequest) {
  try {
    // Support both authenticated and anonymous users
    let user;
    try {
      const authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
    } catch (error) {
      // Fallback to anonymous user
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }
      user = anonData.user;
    }

    const body = await request.json();
    const { characterId } = body;

    // IMPORTANT: Use authenticated user's ID as entityId
    const entityId = user.id;

    logger.info(
      "[Eliza Rooms API] Creating room for entity:",
      entityId,
      "| characterId:",
      characterId || "default",
    );

    // Validate characterId if provided
    if (characterId && typeof characterId !== "string") {
      logger.error(
        "[Eliza Rooms API] Invalid characterId type:",
        typeof characterId,
      );
      return NextResponse.json(
        { error: "characterId must be a string" },
        { status: 400 },
      );
    }

    // Create room with minimal data
    // The runtime will set up entity/participant connections on first message
    const roomId = uuidv4();
    const createdAt = Date.now();

    // Create room via service (pure DB operation)
    await roomsService.createRoom({
      id: roomId,
      agentId: characterId || undefined, // Single source of truth for character/agent ID
      entityId,
      source: "web",
      type: "DM",
      metadata: {
        createdAt,
      },
    });

    logger.info(
      "[Eliza Rooms API] ✓ Room created:",
      roomId,
      "for entity:",
      entityId,
    );

    return NextResponse.json({
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt,
    });
  } catch (error) {
    logger.error(
      "[Eliza Rooms API] Error creating room:",
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
