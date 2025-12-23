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
import type { UUID } from "@elizaos/core";
import type { RoomMetadata } from "@/lib/types/message-content";
import {
  parseMessageContent,
  type MessageAttachment,
} from "@/lib/types/message-content";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "DELETE", "OPTIONS"]);
}

/**
 * Verify user has access to the chat
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
 * Get chat history (messages)
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

    // Deduplicate messages by content hash (same text + same entityId within 5 seconds = duplicate)
    const seenMessages = new Map<string, (typeof messages)[0]>();
    const deduplicatedMessages = messages.filter((msg) => {
      const content = msg.content as Record<string, unknown>;
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

      // Extract text content - handle multiple possible structures
      // ElizaOS stores content differently for user vs agent messages
      let textContent = "";
      if (typeof content === "object" && content !== null) {
        const c = content as Record<string, unknown>;

        // Try direct text field first (if non-empty)
        if (typeof c.text === "string" && c.text.length > 0) {
          textContent = c.text;
        }
        // Check thought field (ElizaOS sometimes stores response in thought)
        else if (typeof c.thought === "string" && c.thought.length > 0) {
          textContent = c.thought;
        }
        // Check response field
        else if (typeof c.response === "string" && c.response.length > 0) {
          textContent = c.response;
        }
        // Check body field
        else if (typeof c.body === "string" && c.body.length > 0) {
          textContent = c.body;
        }
        // Fallback: check if content itself is the text
        else if (typeof c.content === "string" && c.content.length > 0) {
          textContent = c.content;
        }
        // Fallback: nested content.text structure
        else if (
          typeof c.content === "object" &&
          c.content !== null &&
          typeof (c.content as Record<string, unknown>).text === "string" &&
          ((c.content as Record<string, unknown>).text as string).length > 0
        ) {
          textContent = (c.content as Record<string, unknown>).text as string;
        }
        // Check message field
        else if (typeof c.message === "string" && c.message.length > 0) {
          textContent = c.message;
        }
        // Last resort: find ANY non-empty string field
        else {
          const stringFields = Object.entries(c)
            .filter(
              ([key, v]) =>
                typeof v === "string" &&
                (v as string).length > 0 &&
                key !== "source" &&
                key !== "action" &&
                key !== "inReplyTo",
            )
            .sort((a, b) => (b[1] as string).length - (a[1] as string).length); // Prefer longer strings
          if (stringFields.length > 0) {
            textContent = stringFields[0][1] as string;
          }
        }
      }

      // Also check metadata for text (ElizaOS sometimes stores there)
      if (!textContent && msg.metadata && typeof msg.metadata === "object") {
        const meta = msg.metadata as Record<string, unknown>;
        if (typeof meta.text === "string" && meta.text.length > 0) {
          textContent = meta.text;
        } else if (
          typeof meta.response === "string" &&
          meta.response.length > 0
        ) {
          textContent = meta.response;
        } else if (
          typeof meta.content === "string" &&
          meta.content.length > 0
        ) {
          textContent = meta.content;
        }
      }

      // Extract attachments from content if present
      const attachments: MessageAttachment[] | undefined =
        Array.isArray(content.attachments) && content.attachments.length > 0
          ? content.attachments
              .filter((att): att is MessageAttachment => {
                return (
                  typeof att === "object" &&
                  att !== null &&
                  "id" in att &&
                  "url" in att &&
                  typeof (att as MessageAttachment).url === "string"
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

      // Safely convert createdAt to ISO string
      const createdAtValue = safeToISOString(msg.createdAt);

      return {
        id: msg.id,
        content: textContent,
        role: isAgent ? ("assistant" as const) : ("user" as const),
        createdAt: createdAtValue,
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
 * Delete a chat
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
