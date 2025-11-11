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
import {
  isTemplateCharacter,
  getTemplate,
  templateToDbFormat,
} from "@/lib/characters/template-loader";
import { charactersService } from "@/lib/services";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq, and } from "drizzle-orm";

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
    let { entityId, characterId } = body;

    // CRITICAL DIAGNOSTIC: Log request details
    logger.info("[Eliza Rooms API] ========== POST /api/eliza/rooms START ==========");
    logger.info(`[Eliza Rooms API] entityId: ${entityId}`);
    logger.info(`[Eliza Rooms API] characterId: ${characterId}`);
    logger.info(`[Eliza Rooms API] characterId type: ${typeof characterId}`);
    logger.info(`[Eliza Rooms API] userId: ${user.id}`);

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      );
    }

    // AUTO-CREATE TEMPLATE CHARACTERS
    // If characterId is a template (starts with "template-"), check if it exists in DB
    // If not, create it from the template JSON automatically
    const isTemplate = characterId ? isTemplateCharacter(characterId) : false;
    logger.info(`[Eliza Rooms API] Template check: isTemplate=${isTemplate}, characterId=${characterId}`);

    if (characterId && isTemplateCharacter(characterId)) {
      logger.info(`[Eliza Rooms API] ✓ ENTERING template auto-creation for: ${characterId}`);

      const template = getTemplate(characterId);
      if (!template) {
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
        // User already has this character, use existing ID
        characterId = existing.id;
        logger.info(`[Eliza Rooms API] ✓ Found existing template character: ${characterId} (${existing.name})`);
      } else {
        // Validate organization_id is present (required by DB schema)
        if (!user.organization_id) {
          logger.error(
            "[Eliza Rooms API] Cannot create template character: user has no organization_id"
          );
          return NextResponse.json(
            { error: "User must be associated with an organization" },
            { status: 400 }
          );
        }

        // Create character from template
        const dbData = templateToDbFormat(
          template,
          user.id,
          user.organization_id
        );

        logger.debug(
          "[Eliza Rooms API] Creating character from template:",
          {
            templateId: template.id,
            templateName: template.name,
            templateSystem: template.system,
            hasSystemInDbData: !!dbData.system,
            systemLength: dbData.system?.length || 0,
          }
        );

        const [created] = await db
          .insert(userCharacters)
          .values(dbData)
          .returning();

        characterId = created.id;
        logger.info(
          "[Eliza Rooms API] Created template character:",
          {
            newCharacterId: characterId,
            templateName: template.name,
            createdName: created.name,
            createdSystem: created.system,
            systemMatches: created.system === template.system,
          }
        );
      }
    } else {
      const reason = !characterId
        ? "No characterId provided"
        : "Not a template ID";
      logger.info(`[Eliza Rooms API] ✗ Skipping template block: ${reason} (characterId: ${characterId || "NONE"})`);
    }

    // CRITICAL: Verify characterId after template handling
    logger.info(`[Eliza Rooms API] Post-template characterId: ${characterId} (type: ${typeof characterId})`);

    // Get runtime AFTER template character creation
    // CRITICAL: If characterId exists, get character-specific runtime
    // Otherwise, get default runtime
    const runtime = characterId
      ? await agentRuntime.getRuntimeForCharacter(characterId)
      : await agentRuntime.getRuntime();

    const roomId = uuidv4();

    logger.debug(
      "[Eliza Rooms API] Using runtime for character:",
      runtime.character.name,
      "agentId:",
      runtime.agentId
    );

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
      characterId || "default"
    );

    // Variable to store greeting for Discord (declared here before the async block)
    let greetingForDiscord: { text: string; characterName: string } | null =
      null;

    // ==================== CRITICAL: CHARACTER MAPPING STORAGE ====================
    logger.info(`[Eliza Rooms API] ========== CHARACTER MAPPING STORAGE ==========`);
    logger.info(`[Eliza Rooms API] roomId: ${roomId}`);
    logger.info(`[Eliza Rooms API] characterId: ${characterId}`);
    logger.info(`[Eliza Rooms API] characterId truthy: ${!!characterId}`);
    logger.info(`[Eliza Rooms API] user.id: ${user.id}`);

    // CRITICAL: Store character mapping FIRST (before greeting message)
    if (characterId) {
      try {
        logger.info(`[Eliza Rooms API] >>> ATTEMPTING to store character mapping...`);
        await elizaRoomCharactersRepository.create({
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });
        logger.info(`[Eliza Rooms API] >>> ✓✓✓ CHARACTER MAPPING STORED SUCCESSFULLY ✓✓✓`);
        logger.info(`[Eliza Rooms API] >>> Room ${roomId} → Character ${characterId}`);
      } catch (mappingError) {
        logger.error(`[Eliza Rooms API] >>> ✗✗✗ FAILED TO STORE CHARACTER MAPPING ✗✗✗`);
        logger.error(`[Eliza Rooms API] >>> Error: ${mappingError}`);
        // Continue anyway - room is created even if mapping fails
      }
    } else {
      logger.info(`[Eliza Rooms API] >>> No characterId provided, skipping mapping storage`);
    }
    logger.info(`[Eliza Rooms API] ========== END CHARACTER MAPPING STORAGE ==========`);

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
        "messages"
      );

      // Explicitly update room's lastTime and lastText for proper sorting
      try {
        await db.execute(
          sql`UPDATE rooms 
              SET "lastTime" = ${greetingTimestamp},
                  "lastText" = ${greetingText}
              WHERE id = ${roomId}::uuid`
        );
        logger.info(
          "[Eliza Rooms API] ✓ Room lastTime updated:",
          greetingTimestamp
        );
      } catch (updateErr) {
        logger.error(
          "[Eliza Rooms API] Failed to update room lastTime:",
          updateErr
        );
      }

      logger.info(
        "[Eliza Rooms API] ✓ Greeting message saved (character:",
        characterName,
        ")"
      );

      // Store greeting for Discord
      greetingForDiscord = { text: greetingText, characterName };
    } catch (initErr) {
      logger.error(
        "[Eliza Rooms API] ✗ Failed to create initial greeting:",
        initErr
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
                  WHERE id = ${roomId}::uuid`
            );
            logger.info(
              `[Eliza Rooms API] Discord thread created: ${threadResult.threadId} for room ${roomId}`
            );

            // Send greeting to Discord thread immediately after thread is created
            if (greetingForDiscord) {
              await discordService.sendToThread(
                threadResult.threadId,
                `**🤖 ${greetingForDiscord.characterName}:** ${greetingForDiscord.text}`
              );
              logger.info(
                `[Eliza Rooms API] Sent greeting to Discord thread ${threadResult.threadId}`
              );
            }
          } catch (err) {
            logger.error(
              "[Eliza Rooms API] Failed to store thread ID or send greeting:",
              err
            );
          }
        }
      })
      .catch((err) => {
        logger.error("[Eliza Rooms API] Failed to create Discord thread:", err);
      });

    // DIAGNOSTIC: Final response data
    const responseData = {
      success: true,
      roomId,
      characterId: characterId || null,
      createdAt: greetingTimestamp,
    };

    logger.info(`[Eliza Rooms API] ========== RESPONSE ==========`);
    logger.info(`[Eliza Rooms API] roomId: ${responseData.roomId}`);
    logger.info(`[Eliza Rooms API] characterId: ${responseData.characterId}`);
    logger.info(`[Eliza Rooms API] hasCharacterId: ${!!responseData.characterId}`);
    logger.info(`[Eliza Rooms API] ========== POST /api/eliza/rooms END ==========`);

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error(
      "[Eliza Rooms API] Error creating room:",
      error instanceof Error ? error.stack : error
    );
    return NextResponse.json(
      {
        error: "Failed to create room",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
