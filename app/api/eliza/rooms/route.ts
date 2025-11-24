import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { stringToUuid, UUID, ChannelType } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { connectionCache } from "@/lib/cache/connection-cache";
import { discordService } from "@/lib/services";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

// GET /api/eliza/rooms - Get user's rooms
export async function GET(request: NextRequest) {
  try {
    // Support both authenticated and anonymous users
    try {
      await requireAuthOrApiKey(request);
    } catch (error) {
      // Fallback to anonymous user
      await getAnonymousUser();
    }

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
      characterMappings =
        await elizaRoomCharactersRepository.findByRoomIds(roomIds);
      logger.debug(
        "[Eliza Rooms API] Batch loaded character mappings:",
        characterMappings.size,
      );
    } catch (err) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to batch load character mappings:",
        err,
      );
    }

    // Get room details with character mappings and titles
    const rooms = await Promise.all(
      roomIds.map(async (roomId) => {
        const room = await runtime.getRoom(roomId);
        const characterId = characterMappings.get(roomId);

        // Fetch room title from database
        let title: string | null = null;
        try {
          const roomData = await db.execute<{ name: string | null }>(
            sql`SELECT name FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
          );
          title = roomData.rows[0]?.name || null;
        } catch (err) {
          logger.error(
            `[Eliza Rooms API] Failed to fetch title for room ${roomId}:`,
            err,
          );
        }

        return {
          id: roomId,
          ...room,
          characterId,
          title,
        };
      }),
    );

    // Sort rooms by most recent first (lastTime descending)
    const sortedRooms = rooms.sort((a, b) => {
      const timeA = (a as any).lastTime || 0;
      const timeB = (b as any).lastTime || 0;
      return timeB - timeA; // Descending order (newest first)
    });

    logger.debug(
      "[Eliza Rooms API] Returning rooms (sorted by most recent):",
      sortedRooms.map((r) => ({
        id: r.id,
        characterId: r.characterId,
        lastTime: (r as any).lastTime,
      })),
    );

    return NextResponse.json({
      success: true,
      rooms: sortedRooms,
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
    // Support both authenticated and anonymous users
    let user, authResult;
    try {
      authResult = await requireAuthOrApiKey(request);
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
    const { entityId, characterId, userId: bodyUserId } = body;
    logger.info(
      "[Eliza Rooms API] Creating room - Request body:",
      JSON.stringify({ entityId, characterId, userId: user.id }),
    );

    // Comprehensive validation with helpful error messages
    if (!entityId || typeof entityId !== "string" || entityId.trim() === "") {
      logger.error("[Eliza Rooms API] entityId is required but invalid:", entityId);
      return NextResponse.json(
        {
          error: "entityId is required and must be a non-empty string",
          receivedEntityId: entityId,
        },
        { status: 400 },
      );
    }

    if (!user || !user.id) {
      logger.error("[Eliza Rooms API] user.id is required but missing");
      return NextResponse.json(
        { error: "Authentication failed: user ID missing" },
        { status: 401 },
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

    // Variable to store greeting for Discord (declared here before the async block)
    let greetingForDiscord: { text: string; characterName: string } | null =
      null;

    // CRITICAL: ALWAYS store character mapping (required for proper room functionality)
    // Use provided characterId or fall back to a "default" identifier
    const finalCharacterId = characterId || "default";
    
    try {
      logger.debug(
        "[Eliza Rooms API] Storing character mapping:",
        {
          room_id: roomId,
          character_id: finalCharacterId,
          user_id: user.id,
        },
      );
      await elizaRoomCharactersRepository.create({
        room_id: roomId,
        character_id: finalCharacterId,
        user_id: user.id,
      });
      logger.info(
        "[Eliza Rooms API] ✓ Character mapping created:",
        roomId,
        "→",
        finalCharacterId,
      );
    } catch (mappingError) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to create character mapping:",
        mappingError,
      );
      // This is critical - if mapping creation fails, we should fail the room creation
      // Otherwise the room will be unusable
      throw new Error(
        `Failed to create character mapping: ${
          mappingError instanceof Error ? mappingError.message : "Unknown error"
        }`,
      );
    }

    // Send initial greeting message using the character's runtime
    const greetingTimestamp = Date.now();
    try {
      logger.debug("[Eliza Rooms API] Generating initial greeting...");

      // Get character-specific runtime if characterId was provided
      const greetingRuntime = characterId
        ? await agentRuntime.getRuntimeForCharacter(characterId)
        : runtime;

      const characterName = greetingRuntime.character?.name || "Eliza";
      const greetingText = `Hello! I'm ${characterName}, your friendly AI assistant. How can I help you today?`;

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
          createdAt: greetingTimestamp,
        },
        "messages",
      );

      // NOTE: lastTime and lastText columns don't exist in our rooms schema
      // Room sorting can be handled by createdAt or message timestamps instead
      // Removed the UPDATE query that was trying to set non-existent columns

      logger.info(
        "[Eliza Rooms API] ✓ Greeting message saved (character:",
        characterName,
        ")",
      );

      // Store greeting for Discord
      greetingForDiscord = { text: greetingText, characterName };
    } catch (initErr) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to create initial greeting:",
        initErr,
      );
    }

    // Create Discord thread for this conversation (fire-and-forget)
    discordService
      .createThread({
        name: `Room: ${roomId.slice(0, 8)}`,
        message: `🆕 New conversation started by ${user.name || user.email || entityId}`,
        autoArchiveDuration: 1440, // 24 hours
      })
      .then(async (threadResult) => {
        if (threadResult.success && threadResult.threadId) {
          // Store thread ID in room metadata
          try {
            await db.execute(
              sql`UPDATE rooms 
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.raw(`'{"discordThreadId": "${threadResult.threadId}"}'`)}::jsonb
                  WHERE id = ${roomId}::uuid`,
            );
            logger.info(
              `[Eliza Rooms API] Discord thread created: ${threadResult.threadId} for room ${roomId}`,
            );

            // Send greeting to Discord thread immediately after thread is created
            if (greetingForDiscord) {
              await discordService.sendToThread(
                threadResult.threadId,
                `**🤖 ${greetingForDiscord.characterName}:** ${greetingForDiscord.text}`,
              );
              logger.info(
                `[Eliza Rooms API] Sent greeting to Discord thread ${threadResult.threadId}`,
              );
            }
          } catch (err) {
            logger.error(
              "[Eliza Rooms API] Failed to store thread ID or send greeting:",
              err,
            );
          }
        }
      })
      .catch((err) => {
        logger.error("[Eliza Rooms API] Failed to create Discord thread:", err);
      });

    return NextResponse.json({
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt: greetingTimestamp, // Use greeting timestamp to ensure consistent sorting
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
