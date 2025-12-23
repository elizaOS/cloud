/**
 * /api/v1/miniapp/agents/[id]/chats/[chatId]
 *
 * GET    - Get chat history (messages)
 * DELETE - Delete a chat
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
import { extractMessageText } from "@/lib/utils/message-text";
import { dbRead, dbWrite } from "@/db/client";
import { roomTable, memoryTable, participantTable } from "@/db/schemas/eliza";
import { eq, and, asc } from "drizzle-orm";
import type { Media, UUID } from "@elizaos/core";
import type { RoomMetadata } from "@/lib/types/message-content";
import {
  parseMessageContent,
  isVisibleDialogueMessage,
  type MessageAttachment,
} from "@/lib/types/message-content";

/**
 * OPTIONS /api/v1/miniapp/agents/[id]/chats/[chatId]
 * CORS preflight handler for miniapp chat management endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "DELETE", "OPTIONS"]);
}

/**
 * Verifies that a user has access to a specific chat.
 * Checks agent ownership, room existence, and user participation/creation.
 *
 * @param chatId - The chat/room ID.
 * @param agentId - The agent ID.
 * @param userId - The user ID.
 * @param organizationId - The organization ID.
 * @returns Access verification result with error details if denied.
 */
async function verifyAccess(
  chatId: string,
  agentId: string,
  userId: string,
  organizationId: string,
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  // Verify agent exists and user has access
  const character = await charactersService.getById(agentId);

  if (!character) {
    return { allowed: false, error: "Agent not found", status: 404 };
  }

  // Verify this is a miniapp agent - miniapp API can only access miniapp-created agents
  if (character.source !== "miniapp") {
    return { allowed: false, error: "Agent not found", status: 404 };
  }

  if (
    character.user_id !== userId &&
    character.organization_id !== organizationId &&
    !character.is_public
  ) {
    return { allowed: false, error: "Access denied", status: 403 };
  }

  // Verify room exists
  const room = await dbRead.query.roomTable.findFirst({
    where: eq(roomTable.id, chatId as UUID),
  });

  if (!room) {
    return { allowed: false, error: "Chat not found", status: 404 };
  }

  // Verify user has access - either via participant record OR as the creator
  const userParticipant = await dbRead.query.participantTable.findFirst({
    where: and(
      eq(participantTable.roomId, chatId as UUID),
      eq(participantTable.entityId, userId as UUID),
    ),
  });

  // Check if user is the room creator (stored in metadata)
  const metadata = (room.metadata as RoomMetadata | null) ?? {};
  const isCreator = metadata.creatorUserId === userId;

  if (!userParticipant && !isCreator) {
    return { allowed: false, error: "Access denied", status: 403 };
  }

  return { allowed: true };
}

/**
 * GET /api/v1/miniapp/agents/[id]/chats/[chatId]
 * Gets chat history (messages) for a specific chat.
 * Supports pagination via limit and before cursor parameters.
 * Includes message attachments if present.
 *
 * Query Parameters:
 * - `limit`: Maximum number of messages to return (default: 50, max: 100).
 * - `before`: Cursor for pagination (message ID).
 *
 * @param request - Request with optional pagination query parameters.
 * @param params - Route parameters containing the agent ID and chat ID.
 * @returns Chat messages with role, content, attachments, and metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId, chatId } = await params;

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

    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10)),
    );
    const before = searchParams.get("before"); // Cursor for pagination

    // Verify access
    const access = await verifyAccess(
      chatId,
      agentId,
      user.id,
      user.organization_id,
    );
    if (!access.allowed) {
      const response = NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Get room details (for name)
    const room = await dbRead.query.roomTable.findFirst({
      where: eq(roomTable.id, chatId as UUID),
    });

    // Get messages from memory table (where roomId exists)
    const messages = await dbRead
      .select()
      .from(memoryTable)
      .where(
        and(eq(memoryTable.roomId, chatId), eq(memoryTable.type, "messages")),
      )
      .orderBy(asc(memoryTable.createdAt))
      .limit(limit);

    // Log raw message count and check for duplicates
    logger.info("[Miniapp API] Raw messages from DB", {
      count: messages.length,
      ids: messages.map((m) => m.id),
      contentPreviews: messages.map((m) => {
        const c = m.content as Record<string, unknown>;
        return {
          id: m.id,
          text: (c?.text as string)?.substring(0, 30),
          entityId: m.entityId,
        };
      }),
    });

    // Filter out action results and deduplicate messages
    const seenMessages = new Map<string, (typeof messages)[0]>();
    const deduplicatedMessages = messages.filter((msg) => {
      const content = msg.content as Record<string, unknown>;
      const metadata = msg.metadata as Record<string, unknown> | undefined;

      // Use centralized visibility check (filters hidden and action_result messages)
      if (!isVisibleDialogueMessage(metadata, content)) {
        return false;
      }

      // Deduplicate by content hash (same text + same entityId within 5 seconds = duplicate)
      const text = (content?.text as string) || "";
      const createdAt = msg.createdAt
        ? new Date(msg.createdAt as string | number | Date).getTime()
        : 0;
      const key = `${msg.entityId}-${text}-${Math.floor(createdAt / 5000)}`; // 5 second window

      if (seenMessages.has(key)) {
        logger.warn("[Miniapp API] Duplicate message detected", {
          duplicateId: msg.id,
          originalId: seenMessages.get(key)?.id,
          text: text.substring(0, 50),
        });
        return false;
      }
      seenMessages.set(key, msg);
      return true;
    });

    logger.info("[Miniapp API] After deduplication", {
      before: messages.length,
      after: deduplicatedMessages.length,
      removed: messages.length - deduplicatedMessages.length,
    });

    // Transform messages and extract attachments
    const transformedMessages = deduplicatedMessages.map((msg) => {
      const rawContent = msg.content;
      const content = parseMessageContent(rawContent);

      // Extract text content using shared utility
      // ElizaOS stores content differently for user vs agent messages
      const textContent = extractMessageText(content, msg.metadata);

      // Debug log to understand content structure (development only)
      if (process.env.NODE_ENV !== "production") {
        logger.debug("[Miniapp API] Message content structure", {
          msgId: msg.id,
          entityId: msg.entityId,
          isAgent: msg.entityId === agentId,
          extractedText: textContent
            ? textContent.substring(0, 100)
            : "(EMPTY - extraction failed)",
        });
      }

      // Extract attachments from content if present
      const attachments: MessageAttachment[] | undefined =
        Array.isArray(content.attachments) && content.attachments.length > 0
          ? content.attachments
              .filter((att): att is Media => {
                return (
                  typeof att === "object" &&
                  att !== null &&
                  "id" in att &&
                  "url" in att &&
                  typeof (att as Media).url === "string"
                );
              })
              .map((att) => ({
                id: att.id,
                url: att.url,
                title: att.title,
                contentType: att.contentType,
              }))
          : undefined;

      const isAgent =
        msg.entityId === agentId ||
        msg.entityId === room?.agentId ||
        (msg.content as Record<string, unknown>)?.source === "agent";

      return {
        id: msg.id,
        content: textContent,
        role: isAgent ? ("assistant" as const) : ("user" as const),
        createdAt: safeToISOString(msg.createdAt),
        metadata: msg.metadata,
        attachments:
          attachments && attachments.length > 0 ? attachments : undefined,
      };
    });

    const response = NextResponse.json({
      success: true,
      messages: transformedMessages,
      chat: {
        id: chatId,
        agentId,
        name: room?.name || null,
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error getting chat", {
      error,
      chatId,
      agentId,
    });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get chat",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

/**
 * DELETE /api/v1/miniapp/agents/[id]/chats/[chatId]
 * Deletes a chat and all associated messages and participants.
 * Requires ownership verification. Rate limited with stricter limits for write operations.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the agent ID and chat ID.
 * @returns Success confirmation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId, chatId } = await params;

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

    // Verify access
    const access = await verifyAccess(
      chatId,
      agentId,
      user.id,
      user.organization_id,
    );
    if (!access.allowed) {
      const response = NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Delete messages first (foreign key constraint)
    await dbWrite.delete(memoryTable).where(eq(memoryTable.roomId, chatId));

    // Delete participants
    await dbWrite
      .delete(participantTable)
      .where(eq(participantTable.roomId, chatId as UUID));

    // Delete room
    await dbWrite.delete(roomTable).where(eq(roomTable.id, chatId as UUID));

    logger.info("[Miniapp API] Deleted chat", {
      chatId,
      agentId,
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      message: "Chat deleted successfully",
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error deleting chat", {
      error,
      chatId,
      agentId,
    });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete chat",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
