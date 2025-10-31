import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { stringToUuid, UUID, ChannelType } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { connectionCache } from "@/lib/cache/connection-cache";

// GET /api/eliza/rooms - Get user's rooms
export async function GET(request: NextRequest) {
  try {
    // Authenticate user or validate API key
    await requireAuthOrApiKey(request);

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const roomIds = await runtime.getRoomsForParticipants([
      stringToUuid(entityId) as UUID,
    ]);

    // Batch load character mappings for all rooms in a single query
    let characterMappings: Map<string, string> = new Map();
    try {
      characterMappings = await elizaRoomCharactersRepository.findByRoomIds(roomIds);
      logger.debug("[Eliza Rooms API] Batch loaded character mappings:", characterMappings.size);
    } catch (err) {
      logger.error("[Eliza Rooms API] ✗ Failed to batch load character mappings:", err);
    }

    // Get room details with character mappings
    const rooms = await Promise.all(
      roomIds.map(async (roomId) => {
        const room = await runtime.getRoom(roomId);
        const characterId = characterMappings.get(roomId);

        return {
          id: roomId,
          ...room,
          characterId,
        };
      }),
    );

    logger.debug("[Eliza Rooms API] Returning rooms:", rooms.map(r => ({ id: r.id, characterId: r.characterId })));

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

// POST /api/eliza/rooms - Create new room
export async function POST(request: NextRequest) {
  try {
    // Authenticate user or validate API key
    const authResult = await requireAuthOrApiKey(request);
    const { user } = authResult;

    const body = await request.json();
    const { entityId, characterId } = body;
    logger.debug("[Eliza Rooms API] Creating room for entity:", entityId, "with character:", characterId, "userId:", user.id);

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const roomId = uuidv4();

    // Ensure room exists
    await runtime.ensureRoomExists({
      id: roomId as UUID,
      source: "web",
      type: ChannelType.DM,
      channelId: roomId,
      serverId: "eliza-server",
      worldId: stringToUuid("eliza-world") as UUID,
      agentId: runtime.agentId,
    });

    // Ensure the user entity is connected to the room so it shows up in participants queries
    const userEntityId = stringToUuid(entityId) as UUID;

    // Pre-create the entity with a top-level metadata.name to satisfy DB constraints
    try {
      await runtime.createEntity({
        id: userEntityId,
        agentId: runtime.agentId as UUID,
        names: [entityId],
        metadata: { name: entityId, web: { userName: entityId } },
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (
        !msg.includes("duplicate key") &&
        !msg.includes("unique constraint")
      ) {
        throw e;
      }
    }

    await runtime.ensureConnection({
      entityId: userEntityId,
      roomId: roomId as UUID,
      worldId: stringToUuid("eliza-world") as UUID,
      source: "web",
      type: ChannelType.DM,
      channelId: roomId,
      serverId: "eliza-server",
      userName: entityId,
    });

    // OPTIMIZATION: Cache the connection to avoid DB queries on future messages
    await connectionCache.markEstablished(roomId, entityId);

    logger.debug(
      "[Eliza Rooms API] Created room:",
      roomId,
      "for entity:",
      entityId,
      "with character:",
      characterId || "default",
    );

    // CRITICAL: Store character mapping FIRST (before greeting message)
    if (characterId) {
      try {
        logger.debug("[Eliza Rooms API] Attempting to store character mapping:", {
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });
        await elizaRoomCharactersRepository.create({
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });
        logger.info("[Eliza Rooms API] ✓ Character mapping stored:", roomId, "→", characterId);
      } catch (mappingError) {
        logger.error("[Eliza Rooms API] ✗ Failed to create character mapping:", mappingError);
        // Continue anyway - room is created even if mapping fails
      }
    } else {
      logger.debug("[Eliza Rooms API] No character specified, using default");
    }

    // Send initial greeting message using the character's runtime
    try {
      logger.debug("[Eliza Rooms API] Generating initial greeting...");

      // Get character-specific runtime if characterId was provided
      const greetingRuntime = characterId
        ? await agentRuntime.getRuntimeForCharacter(characterId)
        : runtime;

      const characterName = greetingRuntime.character?.name || "Eliza";
      const greetingText =
        `Hello! I'm ${characterName}, your friendly AI assistant. How can I help you today?`;

      await greetingRuntime.createMemory(
        {
          id: uuidv4() as UUID,
          roomId: roomId as UUID,
          entityId: greetingRuntime.agentId,
          agentId: greetingRuntime.agentId,
          content: {
            text: greetingText,
            type: "agent",
          },
          createdAt: Date.now(),
        },
        "messages",
      );
      logger.info("[Eliza Rooms API] ✓ Greeting message saved (character:", characterName, ")");
    } catch (initErr) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to create initial greeting:",
        initErr,
      );
    }

    return NextResponse.json({
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt: Date.now(),
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
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
