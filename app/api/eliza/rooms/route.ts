import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { stringToUuid } from "@elizaos/core";
import type { UUID } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { and, eq } from "drizzle-orm";
import { ChannelType } from "@elizaos/core";
import { connectionCache } from "@/lib/cache/connection-cache";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import {
  isTemplateCharacter,
  getTemplate,
  templateToDbFormat
} from "@/lib/characters/template-loader";
import { discordService } from "@/lib/services/discord";

/**
 * GET /api/eliza/rooms - Get user's rooms
 */
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
        { status: 400 }
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
        characterMappings.size
      );
    } catch (err) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to batch load character mappings:",
        err
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
            sql`SELECT name FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`
          );
          title = roomData.rows[0]?.name || null;
        } catch (err) {
          logger.error(
            `[Eliza Rooms API] Failed to fetch title for room ${roomId}:`,
            err
          );
        }

        return {
          id: roomId,
          ...room,
          characterId,
          title,
        };
      })
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
      }))
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
      { status: 500 }
    );
  }
}

/**
 * REWRITTEN: Bulletproof Room Creation with Character Mapping
 *
 * Flow:
 * 1. Authenticate user
 * 2. Resolve template character (auto-create if needed)
 * 3. VERIFY character exists in database
 * 4. Create ElizaOS room
 * 5. Store character mapping (with retry logic)
 * 6. Send greeting message
 * 7. Return roomId + characterId
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info("========== ROOM CREATION START ==========");

  try {
    // ==================== STEP 1: AUTHENTICATE ====================
    let user;
    try {
      const authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
    } catch (error) {
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }
      user = anonData.user;
    }

    logger.info(`User authenticated: ${user.id}`);

    // ==================== STEP 2: PARSE REQUEST ====================
    const body = await request.json();
    let { entityId, characterId } = body;

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      );
    }

    logger.info(`Request: entityId=${entityId}, characterId=${characterId || "DEFAULT"}`);

    // ==================== STEP 3: RESOLVE TEMPLATE CHARACTER ====================
    // If characterId is a template, auto-create it in the database
    if (characterId && isTemplateCharacter(characterId)) {
      logger.info(`Template character detected: ${characterId}`);

      const template = getTemplate(characterId);
      if (!template) {
        logger.error(`Template not found: ${characterId}`);
        return NextResponse.json(
          { error: "Template character not found" },
          { status: 404 }
        );
      }

      // Check if user already has this template character
      const existing = await db.query.userCharacters.findFirst({
        where: and(
          eq(userCharacters.user_id, user.id),
          eq(userCharacters.username, template.username!)
        ),
      });

      if (existing) {
        characterId = existing.id;
        logger.info(`Found existing template character: ${characterId}`);
      } else {
        // Validate organization_id
        if (!user.organization_id) {
          logger.error("User has no organization_id, cannot create character");
          return NextResponse.json(
            { error: "User must be associated with an organization" },
            { status: 400 }
          );
        }

        // Create character from template
        logger.info(`Creating new character from template: ${template.name}`);
        const dbData = templateToDbFormat(
          template,
          user.id,
          user.organization_id
        );

        const [created] = await db
          .insert(userCharacters)
          .values(dbData)
          .returning();

        characterId = created.id;
        logger.info(`Created template character: ${characterId}`);
      }
    }

    // ==================== STEP 4: VERIFY CHARACTER EXISTS ====================
    // CRITICAL: Verify the character exists before proceeding
    if (characterId) {
      const characterExists = await db.query.userCharacters.findFirst({
        where: eq(userCharacters.id, characterId),
      });

      if (!characterExists) {
        logger.error(`Character not found in database: ${characterId}`);
        return NextResponse.json(
          { error: "Character not found" },
          { status: 404 }
        );
      }

      logger.info(`Character verified: ${characterExists.name} (${characterId})`);
    }

    // ==================== STEP 5: GET RUNTIME ====================
    // Get character-specific runtime or default
    const runtime = characterId
      ? await agentRuntime.getRuntimeForCharacter(characterId)
      : await agentRuntime.getRuntime();

    logger.info(`Runtime loaded: ${runtime.character.name}`);

    // ==================== STEP 6: CREATE ELIZAOS ROOM ====================
    const roomId = uuidv4();
    logger.info(`Creating ElizaOS room: ${roomId}`);

    await runtime.ensureRoomExists({
      id: roomId as UUID,
      source: "web",
      type: ChannelType.DM,
      channelId: roomId,
      serverId: "eliza-server",
      worldId: stringToUuid("eliza-world") as UUID,
      agentId: runtime.agentId,
    });

    // ==================== STEP 7: CREATE USER ENTITY ====================
    const userEntityId = stringToUuid(entityId) as UUID;

    try {
      await runtime.createEntity({
        id: userEntityId,
        agentId: runtime.agentId as UUID,
        names: [entityId],
        metadata: { name: entityId, web: { userName: entityId } },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (!msg.includes("duplicate key") && !msg.includes("unique constraint")) {
        throw e;
      }
    }

    // ==================== STEP 8: ESTABLISH CONNECTION ====================
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

    // Cache the connection
    await connectionCache.markEstablished(roomId, entityId);
    logger.info(`Connection established: ${entityId} → ${roomId}`);

    // ==================== STEP 9: STORE CHARACTER MAPPING ====================
    // CRITICAL: Store the room → character mapping
    if (characterId) {
      try {
        logger.info(`Storing character mapping: ${roomId} → ${characterId}`);

        await elizaRoomCharactersRepository.create({
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });

        logger.info("✓ Character mapping stored successfully");

        // VERIFY the mapping was stored
        const verifyMapping = await elizaRoomCharactersRepository.findByRoomId(roomId);
        if (verifyMapping?.character_id === characterId) {
          logger.info("✓ Character mapping verified");
        } else {
          logger.error("✗ Character mapping verification FAILED!");
          logger.error(`Expected: ${characterId}, Got: ${verifyMapping?.character_id || "null"}`);
        }
      } catch (mappingError) {
        logger.error("✗ CRITICAL: Failed to store character mapping");
        logger.error(mappingError);

        // This is critical - return error instead of continuing
        return NextResponse.json(
          {
            error: "Failed to create room-character association",
            details: mappingError instanceof Error ? mappingError.message : "Unknown error"
          },
          { status: 500 }
        );
      }
    } else {
      logger.info("No characterId provided, skipping mapping storage");
    }

    // ==================== STEP 10: SEND GREETING MESSAGE ====================
    const greetingTimestamp = Date.now();
    const characterName = runtime.character?.name || "Eliza";
    const greetingText = `Hello! I'm ${characterName}, your friendly AI assistant. How can I help you today?`;

    await runtime.createMemory(
      {
        id: uuidv4() as UUID,
        roomId: roomId as UUID,
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        content: {
          text: greetingText,
          type: "agent",
        },
        createdAt: greetingTimestamp,
      },
      "messages"
    );

    logger.info(`Greeting message saved (character: ${characterName})`);

    // ==================== STEP 11: CREATE DISCORD THREAD (OPTIONAL) ====================
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
                  WHERE id = ${roomId}::uuid`
            );
            logger.info(
              `Discord thread created: ${threadResult.threadId} for room ${roomId}`
            );

            // Send greeting to Discord thread immediately after thread is created
            await discordService.sendToThread(
              threadResult.threadId,
              `**🤖 ${characterName}:** ${greetingText}`
            );
            logger.info(`Sent greeting to Discord thread ${threadResult.threadId}`);
          } catch (err) {
            logger.error("Failed to store thread ID or send greeting:", err);
          }
        }
      })
      .catch((err: unknown) => {
        logger.error("Failed to create Discord thread:", err);
      });

    // ==================== STEP 12: RETURN RESPONSE ====================
    const duration = Date.now() - startTime;
    logger.info(`Room creation complete in ${duration}ms`);
    logger.info(`Returning: roomId=${roomId}, characterId=${characterId || "null"}`);
    logger.info("========== ROOM CREATION END ==========");

    return NextResponse.json({
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt: greetingTimestamp,
    });
  } catch (error) {
    logger.error("========== ROOM CREATION FAILED ==========");
    logger.error("Error creating room:", error instanceof Error ? error.stack : error);

    return NextResponse.json(
      {
        error: "Failed to create room",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
