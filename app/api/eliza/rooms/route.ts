import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { stringToUuid, UUID, ChannelType } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import { elizaRoomCharactersRepository, userCharactersRepository } from "@/db/repositories";
import { connectionCache } from "@/lib/cache/connection-cache";
import { discordService, anonymousSessionsService, usersService } from "@/lib/services";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

// GET /api/eliza/rooms - Get user's rooms
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Check for session token in header or query param
    const headerSessionToken = request.headers.get("X-Anonymous-Session");
    const querySessionToken = searchParams.get("sessionToken");
    const providedSessionToken = headerSessionToken || querySessionToken;
    
    // Support both authenticated and anonymous users
    try {
      await requireAuthOrApiKey(request);
    } catch (error) {
      // CRITICAL: First try the provided session token (from URL/header)
      // This ensures we don't overwrite the session created by /api/affiliate/create-session
      if (providedSessionToken) {
        logger.debug("[Eliza Rooms API GET] Checking provided session token:", providedSessionToken.slice(0, 8) + "...");
        const session = await anonymousSessionsService.getByToken(providedSessionToken);
        if (session) {
          const sessionUser = await usersService.getById(session.user_id);
          if (sessionUser && sessionUser.is_anonymous) {
            logger.debug("[Eliza Rooms API GET] Anonymous auth via provided token:", sessionUser.id);
            // Token is valid, continue without creating new session
          } else {
            logger.debug("[Eliza Rooms API GET] Session user not found or not anonymous");
          }
        } else {
          logger.debug("[Eliza Rooms API GET] Session not found for token:", providedSessionToken.slice(0, 8) + "...");
        }
      }
      
      // Fallback to anonymous user - try cookie only, DON'T create new session
      // If there's no valid session, just continue - rooms will be empty
      const anonData = await getAnonymousUser();
      if (!anonData && !providedSessionToken) {
        // Only create new session if no token was provided at all
        // This is a fallback for legacy clients that don't pass tokens
        logger.debug("[Eliza Rooms API GET] No session cookie or token - creating new anonymous session");
        const { getOrCreateAnonymousUser } = await import("@/lib/auth-anonymous");
        await getOrCreateAnonymousUser();
      }
    }
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

    // Collect unique character IDs to batch fetch their names
    const uniqueCharacterIds = new Set<string>();
    for (const charId of characterMappings.values()) {
      if (charId) uniqueCharacterIds.add(charId);
    }

    // Batch fetch character names
    const characterNames = new Map<string, string>();
    if (uniqueCharacterIds.size > 0) {
      try {
        const characterPromises = Array.from(uniqueCharacterIds).map(async (charId) => {
          const character = await userCharactersRepository.findById(charId);
          if (character) {
            characterNames.set(charId, character.name);
          }
        });
        await Promise.all(characterPromises);
        logger.debug(
          "[Eliza Rooms API] Batch loaded character names:",
          characterNames.size,
        );
      } catch (err) {
        logger.error(
          "[Eliza Rooms API] Failed to batch load character names:",
          err,
        );
      }
    }

    // Get room details with character mappings and titles
    const rooms = await Promise.all(
      roomIds.map(async (roomId) => {
        const room = await runtime.getRoom(roomId);
        const characterId = characterMappings.get(roomId);
        const characterName = characterId ? characterNames.get(characterId) || null : null;

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
          characterName,
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
    const body = await request.json();
    const { entityId, characterId, sessionToken: bodySessionToken } = body;
    
    // Also check header for session token
    const headerSessionToken = request.headers.get("X-Anonymous-Session");
    const providedSessionToken = headerSessionToken || bodySessionToken;
    
    // Support both authenticated and anonymous users
    let user, authResult;
    try {
      authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
      logger.info("[Eliza Rooms API] Authenticated via Privy:", user.id);
    } catch (authError) {
      // Fallback to anonymous user
      logger.info("[Eliza Rooms API] Privy auth failed, trying anonymous...", 
        authError instanceof Error ? authError.message : "Unknown error");
      
      // CRITICAL: First try the provided session token (from URL/body)
      // This ensures we don't overwrite the session created by /api/affiliate/create-session
      if (providedSessionToken) {
        logger.info("[Eliza Rooms API] Checking provided session token:", providedSessionToken.slice(0, 8) + "...");
        const session = await anonymousSessionsService.getByToken(providedSessionToken);
        if (session) {
          const sessionUser = await usersService.getById(session.user_id);
          if (sessionUser && sessionUser.is_anonymous) {
            user = sessionUser;
            logger.info("[Eliza Rooms API] Anonymous auth via provided token:", user.id);
          }
        }
      }
      
      // If provided token didn't work, try the cookie
      if (!user) {
        const anonData = await getAnonymousUser();
        
        if (anonData) {
          user = anonData.user;
          logger.info("[Eliza Rooms API] Anonymous auth successful via cookie:", user.id);
        } else {
          // No cookie found - create a new anonymous session
          // This handles the case where the cookie wasn't set properly
          logger.info("[Eliza Rooms API] No session cookie - creating new anonymous session");
          
          try {
            const { getOrCreateAnonymousUser } = await import("@/lib/auth-anonymous");
            const newAnonData = await getOrCreateAnonymousUser();
            user = newAnonData.user;
            logger.info("[Eliza Rooms API] Created new anonymous session:", user.id);
          } catch (createError) {
            logger.error("[Eliza Rooms API] Failed to create anonymous session:", 
              createError instanceof Error ? createError.message : "Unknown error");
            throw new Error("Authentication required - failed to create anonymous session");
          }
        }
      }
    }
    
    logger.info(
      "[Eliza Rooms API] ⚡ Creating room for entity:",
      entityId,
      "| characterId from request:",
      characterId,
      "| userId:",
      user.id,
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

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    // IMPORTANT: Create character-specific runtime if characterId is provided
    // Otherwise create default runtime
    const runtime = characterId
      ? await agentRuntime.getRuntimeForCharacter(characterId)
      : await agentRuntime.getRuntime();

    logger.info(
      "[Eliza Rooms API] 🎭 Runtime created for character:",
      runtime.character.name,
    );

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

    // CRITICAL: Store character mapping FIRST (before greeting message)
    if (characterId) {
      try {
        logger.info("[Eliza Rooms API] 💾 Storing character mapping:", {
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });
        await elizaRoomCharactersRepository.create({
          room_id: roomId,
          character_id: characterId,
          user_id: user.id,
        });
        logger.info(
          "[Eliza Rooms API] ✅ Character mapping stored successfully:",
          roomId,
          "→",
          characterId,
        );
      } catch (mappingError) {
        logger.error(
          "[Eliza Rooms API] ❌ Failed to create character mapping:",
          mappingError,
        );
        // Continue anyway - room is created even if mapping fails
      }
    } else {
      logger.info(
        "[Eliza Rooms API] ℹ️  No characterId provided, using default Eliza",
      );
    }

    // Send initial greeting message using the character's runtime
    const greetingTimestamp = Date.now();
    try {
      logger.info(
        "[Eliza Rooms API] 👋 Generating initial greeting for character:",
        runtime.character.name,
      );

      // Use the runtime we already created (already has correct character)
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
        "messages",
      );

      // Explicitly update room's lastTime and lastText for proper sorting
      try {
        await db.execute(
          sql`UPDATE rooms 
              SET "lastTime" = ${greetingTimestamp},
                  "lastText" = ${greetingText}
              WHERE id = ${roomId}::uuid`,
        );
        logger.info(
          "[Eliza Rooms API] ✓ Room lastTime updated:",
          greetingTimestamp,
        );
      } catch (updateErr) {
        logger.error(
          "[Eliza Rooms API] Failed to update room lastTime:",
          updateErr,
        );
      }

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
