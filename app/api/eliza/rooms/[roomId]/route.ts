import { NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import type { NextRequest } from "next/server";
import { roomsService } from "@/lib/services/agents/rooms";
import { agentsService } from "@/lib/services/agents/agents";
import { logger } from "@/lib/utils/logger";
import { parseMessageContent, type MessageContent } from "@/lib/types/message-content";
import type { Memory } from "@elizaos/core";

/**
 * GET /api/eliza/rooms/[roomId] - Get room details and messages
 *
 * Pure database operation - no runtime needed
 * Uses agentsService to get agent display info
 * Requires the authenticated user to be a participant of the room
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  // Get authenticated user ID
  let userId: string;

  try {
    const authResult = await requireAuthOrApiKey(request);
    userId = authResult.user.id;
  } catch {
    // Fallback to anonymous user
    const anonData = await getAnonymousUser();
    if (!anonData) {
      // Create new anonymous session if none exists
      const { getOrCreateAnonymousUser } =
        await import("@/lib/auth-anonymous");
      const newAnonData = await getOrCreateAnonymousUser();
      userId = newAnonData.user.id;
    } else {
      userId = anonData.user.id;
    }
  }

  const { roomId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId is required" },
      { status: 400 },
    );
  }

  // Access control: verify user is a participant of the room
  const hasAccess = await roomsService.hasAccess(roomId, userId);
  if (!hasAccess) {
    logger.warn(
      `[Eliza Room API] Access denied: User ${userId} attempted to access room ${roomId}`,
    );
    return NextResponse.json(
      { error: "You don't have permission to access this room" },
      { status: 403 },
    );
  }

  // Use rooms service to get room with messages (pure DB query)
  const roomData = await roomsService.getRoomWithMessages(
    roomId,
    limit ? parseInt(limit) : 50,
  );

  if (!roomData) {
    return NextResponse.json(
      { error: "Room not found" },
      { status: 404 },
    );
  }

  // Get character ID from room agentId (single source of truth)
  const characterId = roomData.room.agentId || undefined;

  if (characterId) {
    logger.info(
      "[Eliza Room API] Loading room with character:",
      characterId,
    );
  } else {
    logger.info("[Eliza Room API] Loading room with default character");
  }

  // Format messages for response with deduplication
  const mapped = roomData.messages.map((msg: Memory) => {
    const content = parseMessageContent(msg.content);

    // Debug: Log attachment info for agent messages
    if (content?.source === "agent" && content?.attachments) {
      logger.info(`[Eliza Room API] 📎 Message ${msg.id?.substring(0, 8)} has ${content.attachments.length} attachment(s)`);
    }

    // CRITICAL: Determine isAgent based on content.source field (most reliable)
    // Fallback to entityId comparison for backward compatibility
    const isAgentBySource = content?.source === "agent";
    const isAgentByEntityId = msg.entityId === msg.agentId;
    const isAgent = content?.source ? isAgentBySource : isAgentByEntityId;

    return {
      id: msg.id,
      entityId: msg.entityId,
      agentId: msg.agentId,
      content: parsedContent,
      createdAt: msg.createdAt || Date.now(),
      isAgent,
    };
  });

  // Deduplicate messages: Remove duplicate agent responses that might have been
  // stored twice (once by action callback, once by handler). Keep the one with
  // attachments or the first one if both/neither have attachments.
  const seenTexts = new Map<string, { index: number; hasAttachments: boolean; isAgent: boolean }>();
  const indicesToRemove = new Set<number>();

  mapped.forEach((msg, index) => {
    const content = msg.content as MessageContent;
    const text = content?.text?.trim();
    if (!text) return;

    // Create a key based on text and approximate timestamp (within 5 seconds)
    const timeWindow = Math.floor(msg.createdAt / 5000);
    const key = `${text}:${timeWindow}`;

    const existing = seenTexts.get(key);
    if (existing) {
      const currentHasAttachments =
        Array.isArray(content?.attachments) && content.attachments.length > 0;

      if (currentHasAttachments && !existing.hasAttachments) {
        indicesToRemove.add(existing.index);
        seenTexts.set(key, { index, hasAttachments: currentHasAttachments, isAgent: msg.isAgent });
      } else if (msg.isAgent && !existing.isAgent) {
        indicesToRemove.add(existing.index);
        seenTexts.set(key, { index, hasAttachments: currentHasAttachments, isAgent: msg.isAgent });
      } else {
        indicesToRemove.add(index);
      }
    } else {
      const hasAttachments = Array.isArray(content?.attachments) && content.attachments.length > 0;
      seenTexts.set(key, { index, hasAttachments, isAgent: msg.isAgent });
    }
  });

  const simple = mapped
    .filter((_, index) => !indicesToRemove.has(index))
    .sort((a, b) => a.createdAt - b.createdAt);

  if (indicesToRemove.size > 0) {
    logger.info(`[Eliza Room API] 🧹 Removed ${indicesToRemove.size} duplicate message(s)`);
  }

  // Get agent display info from database (no runtime needed!)
  let agentInfo: { id: string; name: string; avatarUrl?: string } | null = null;

  if (characterId) {
    agentInfo = await agentsService.getDisplayInfo(characterId);
  }

  if (!agentInfo && roomData.room.agentId) {
    agentInfo = await agentsService.getDisplayInfo(roomData.room.agentId);
  }

  if (!agentInfo) {
    agentInfo = {
      id: characterId || roomData.room.agentId || "default",
      name: "Eliza",
      avatarUrl: undefined,
    };
  }

  return NextResponse.json(
    {
      success: true,
      roomId,
      messages: simple,
      count: simple.length,
      characterId,
      agent: agentInfo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * DELETE /api/eliza/rooms/[roomId] - Delete a room and all related data
 *
 * Pure database operation - no runtime needed
 * Requires the authenticated user to be a participant of the room
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  // Get authenticated user ID
  let userId: string;

  try {
    const authResult = await requireAuthOrApiKey(request);
    userId = authResult.user.id;
  } catch {
    // Fallback to anonymous user
    const anonData = await getAnonymousUser();
    if (!anonData) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    userId = anonData.user.id;
  }

  const { roomId } = await ctx.params;

  if (!roomId) {
    return NextResponse.json(
      { error: "roomId is required" },
      { status: 400 },
    );
  }

  // Access control: verify user is a participant of the room
  const hasAccess = await roomsService.hasAccess(roomId, userId);
  if (!hasAccess) {
    logger.warn(
      `[Eliza Room API] Access denied: User ${userId} attempted to delete room ${roomId}`,
    );
    return NextResponse.json(
      { error: "You don't have permission to delete this room" },
      { status: 403 },
    );
  }

  logger.info("[Eliza Room API] Deleting room:", roomId, "by user:", userId);

  // Use rooms service to delete room and all related data
  await roomsService.deleteRoom(roomId);

  logger.info("[Eliza Room API] ✓ Room deleted successfully:", roomId);

  return NextResponse.json({
    success: true,
    message: "Room deleted successfully",
    roomId,
  });
}
