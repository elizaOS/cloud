/**
 * /api/v1/miniapp/agents/[id]/chats/[chatId]
 *
 * GET    - Get chat history (messages)
 * DELETE - Delete a chat
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services";
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
import { db } from "@/db/client";
import { roomTable, memoryTable, participantTable } from "@/db/schemas/eliza";
import { eq, and, asc } from "drizzle-orm";
import type { UUID } from "@elizaos/core";
import type { RoomMetadata } from "@/lib/types/message-content";
import { parseMessageContent, type MessageAttachment } from "@/lib/types/message-content";

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
  const room = await db.query.roomTable.findFirst({
    where: eq(roomTable.id, chatId as UUID),
  });

  if (!room) {
    return { allowed: false, error: "Chat not found", status: 404 };
  }

  // Verify user has access - either via participant record OR as the creator
  const userParticipant = await db.query.participantTable.findFirst({
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
    const room = await db.query.roomTable.findFirst({
      where: eq(roomTable.id, chatId as UUID),
    });

    // Get messages from memory table (where roomId exists)
    const messages = await db
      .select()
      .from(memoryTable)
      .where(
        and(eq(memoryTable.roomId, chatId), eq(memoryTable.type, "messages")),
      )
      .orderBy(asc(memoryTable.createdAt))
      .limit(limit);

    // Transform messages and extract attachments
    const transformedMessages = messages.map((msg) => {
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
            .filter(([key, v]) => typeof v === "string" && (v as string).length > 0 && key !== "source" && key !== "action" && key !== "inReplyTo")
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
        } else if (typeof meta.response === "string" && meta.response.length > 0) {
          textContent = meta.response;
        } else if (typeof meta.content === "string" && meta.content.length > 0) {
          textContent = meta.content;
        }
      }

      // Debug log to understand content structure
      logger.info("[Miniapp API] Message content structure", {
        msgId: msg.id,
        entityId: msg.entityId,
        agentIdFromUrl: agentId,
        isAgent: msg.entityId === agentId,
        rawContentType: typeof rawContent,
        rawContentSample: JSON.stringify(rawContent)?.substring(0, 800),
        metadataSample: JSON.stringify(msg.metadata)?.substring(0, 300),
        parsedContentKeys: typeof content === "object" && content ? Object.keys(content) : [],
        extractedText: textContent ? textContent.substring(0, 100) : "(EMPTY - extraction failed)",
      });

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

      return {
        id: msg.id,
        content: textContent,
        role:
          msg.entityId === agentId ? ("assistant" as const) : ("user" as const),
        createdAt: msg.createdAt,
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
    await db.delete(memoryTable).where(eq(memoryTable.roomId, chatId));

    // Delete participants
    await db
      .delete(participantTable)
      .where(eq(participantTable.roomId, chatId as UUID));

    // Delete room
    await db.delete(roomTable).where(eq(roomTable.id, chatId as UUID));

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
