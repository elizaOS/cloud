/**
 * /api/v1/miniapp/agents/[id]/chats
 *
 * GET  - List all chats for an agent
 * POST - Create a new chat with an agent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkMiniappRateLimit,
  createRateLimitErrorResponse,
  MINIAPP_RATE_LIMITS,
  MINIAPP_WRITE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";
import { safeToISOString } from "@/lib/utils/date";
import { dbRead, dbWrite } from "@/db/client";
import { roomTable, memoryTable, participantTable } from "@/db/schemas/eliza";
import { eq, and, desc, sql, or, inArray } from "drizzle-orm";
import type { UUID } from "@elizaos/core";
import { parseMessageContent } from "@/lib/types/message-content";

/**
 * OPTIONS /api/v1/miniapp/agents/[id]/chats
 * CORS preflight handler for miniapp agent chats endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "POST", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/agents/[id]/chats
 * Lists all chats (rooms) for a specific agent.
 * Supports pagination and includes last message preview and message counts.
 * Only returns chats for miniapp-created agents.
 *
 * Query Parameters:
 * - `page`: Page number (default: 1).
 * - `limit`: Results per page (default: 20, max: 50).
 *
 * @param request - Request with optional pagination query parameters.
 * @param params - Route parameters containing the agent ID.
 * @returns Paginated list of chats with last message and metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId } = await params;

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );
    const offset = (page - 1) * limit;

    // Verify agent exists and user has access
    const character = await charactersService.getById(agentId);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a miniapp agent - miniapp API can only access miniapp-created agents
    if (character.source !== "miniapp") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Find rooms for this user and agent
    // Query in two ways to catch both:
    // 1. Rooms where user is a participant (after first message is sent)
    // 2. Rooms where user is the creator (stored in metadata, before any messages)

    // First, get rooms where user is a participant
    const roomsWithParticipants = await dbRead
      .select({
        room: roomTable,
      })
      .from(roomTable)
      .innerJoin(participantTable, eq(roomTable.id, participantTable.roomId))
      .where(
        and(
          eq(participantTable.entityId, user.id as UUID),
          eq(roomTable.agentId, agentId as UUID),
          inArray(roomTable.type, ["DM", "DIRECT"]),
        ),
      )
      .orderBy(desc(roomTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Then get rooms where user is creator (in metadata) - for newly created rooms
    // that haven't had messages sent yet
    const roomsFromMetadata = await dbRead
      .select()
      .from(roomTable)
      .where(
        and(
          eq(roomTable.agentId, agentId as UUID),
          inArray(roomTable.type, ["DM", "DIRECT"]),
          sql`${roomTable.metadata}->>'creatorUserId' = ${user.id}`,
        ),
      )
      .orderBy(desc(roomTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Merge and deduplicate rooms
    const roomMap = new Map<string, typeof roomTable.$inferSelect>();
    for (const { room } of roomsWithParticipants) {
      roomMap.set(room.id, room);
    }
    for (const room of roomsFromMetadata) {
      if (!roomMap.has(room.id)) {
        roomMap.set(room.id, room);
      }
    }
    const rooms = Array.from(roomMap.values()).slice(0, limit);

    // Get last message and count for each room
    const chatsWithMessages = await Promise.all(
      rooms.map(async (room) => {
        // Get last message (from memoryTable, which has roomId)
        const [lastMessage] = await dbRead
          .select()
          .from(memoryTable)
          .where(
            and(
              eq(memoryTable.roomId, room.id),
              eq(memoryTable.type, "messages"),
            ),
          )
          .orderBy(desc(memoryTable.createdAt))
          .limit(1);

        // Count messages
        const messageCount = await dbRead
          .select()
          .from(memoryTable)
          .where(
            and(
              eq(memoryTable.roomId, room.id),
              eq(memoryTable.type, "messages"),
            ),
          );

        const lastMessageContent = lastMessage
          ? parseMessageContent(lastMessage.content)
          : null;

        return {
          id: room.id,
          agentId,
          name: room.name || null,
          createdAt: safeToISOString(room.createdAt),
          updatedAt: safeToISOString(lastMessage?.createdAt || room.createdAt),
          lastMessage:
            lastMessage && lastMessageContent
              ? {
                  content: lastMessageContent.text || "",
                  role: lastMessage.entityId === agentId ? "assistant" : "user",
                  createdAt: safeToISOString(lastMessage.createdAt),
                }
              : null,
          messageCount: messageCount.length,
        };
      }),
    );

    const chats = chatsWithMessages;

    const response = NextResponse.json({
      success: true,
      chats,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(chats.length / limit),
        totalCount: chats.length,
        hasMore: chats.length === limit,
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error listing chats", { error, agentId });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list chats",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

/**
 * POST /api/v1/miniapp/agents/[id]/chats
 * Creates a new chat (room) with an agent.
 * The room is created immediately, but entities/participants are set up when the first message is sent.
 * Rate limited with stricter limits for write operations.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the agent ID.
 * @returns Created chat details including room ID and timestamps.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId } = await params;

  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_WRITE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify agent exists and user has access
    const character = await charactersService.getById(agentId);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a miniapp agent - miniapp API can only access miniapp-created agents
    if (character.source !== "miniapp") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id &&
      !character.is_public
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Create room (source and type are required fields - notNull, no defaults)
    // Store the creator's user ID in metadata so we can query rooms by user later.
    // We don't create entities or participants here - the ElizaOS runtime
    // will handle entity/participant creation when the first message is sent
    // (via ensureConnection in message-handler.ts). This avoids foreign key
    // constraint issues since entities might not exist in entityTable yet.
    const [room] = await dbWrite
      .insert(roomTable)
      .values({
        source: "miniapp",
        type: "DM",
        agentId: agentId as UUID,
        metadata: { creatorUserId: user.id },
        createdAt: new Date(),
      })
      .returning();

    logger.info("[Miniapp API] Created chat", {
      roomId: room.id,
      agentId,
      userId: user.id,
    });

    const response = NextResponse.json(
      {
        success: true,
        chat: {
          id: room.id,
          agentId,
          createdAt: safeToISOString(room.createdAt),
          updatedAt: safeToISOString(room.createdAt),
        },
      },
      { status: 201 },
    );

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error creating chat", { error, agentId });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create chat",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
