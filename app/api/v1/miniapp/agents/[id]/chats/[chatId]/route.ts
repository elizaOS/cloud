/**
 * /api/v1/miniapp/agents/[id]/chats/[chatId]
 * 
 * GET    - Get chat history (messages)
 * DELETE - Delete a chat
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
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
  organizationId: string
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  // Verify agent exists and user has access
  const character = await charactersService.getById(agentId);
  
  if (!character) {
    return { allowed: false, error: "Agent not found", status: 404 };
  }
  
  if (character.user_id !== userId && character.organization_id !== organizationId && !character.is_public) {
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
      eq(participantTable.entityId, userId as UUID)
    ),
  });
  
  // Check if user is the room creator (stored in metadata)
  const isCreator = (room.metadata as { creatorUserId?: string } | null)?.creatorUserId === userId;
  
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
  { params }: { params: Promise<{ id: string; chatId: string }> }
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId, chatId } = await params;
  
  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(request, MINIAPP_RATE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(rateLimitResult, corsResult.origin ?? undefined);
  }
  
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const before = searchParams.get("before"); // Cursor for pagination
    
    // Verify access
    const access = await verifyAccess(chatId, agentId, user.id, user.organization_id);
    if (!access.allowed) {
      const response = NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
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
      .where(and(
        eq(memoryTable.roomId, chatId),
        eq(memoryTable.type, "messages")
      ))
      .orderBy(asc(memoryTable.createdAt))
      .limit(limit);
    
    const response = NextResponse.json({
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : (msg.content as { text?: string })?.text || '',
        role: msg.entityId === agentId ? 'assistant' : 'user',
        createdAt: msg.createdAt,
        metadata: msg.metadata,
      })),
      chat: {
        id: chatId,
        agentId,
        name: room?.name || null,
      },
    });
    
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error getting chat", { error, chatId, agentId });
    
    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get chat" },
      { status }
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
  { params }: { params: Promise<{ id: string; chatId: string }> }
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId, chatId } = await params;
  
  // Rate limiting (stricter for write operations)
  const rateLimitResult = await checkMiniappRateLimit(request, MINIAPP_WRITE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(rateLimitResult, corsResult.origin ?? undefined);
  }
  
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    
    // Verify access
    const access = await verifyAccess(chatId, agentId, user.id, user.organization_id);
    if (!access.allowed) {
      const response = NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
      return addCorsHeaders(response, corsResult.origin);
    }
    
    // Delete messages first (foreign key constraint)
    await db.delete(memoryTable).where(eq(memoryTable.roomId, chatId));
    
    // Delete participants
    await db.delete(participantTable).where(eq(participantTable.roomId, chatId as UUID));
    
    // Delete room
    await db.delete(roomTable).where(eq(roomTable.id, chatId as UUID));
    
    logger.info("[Miniapp API] Deleted chat", { chatId, agentId, userId: user.id });
    
    const response = NextResponse.json({
      success: true,
      message: "Chat deleted successfully",
    });
    
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error deleting chat", { error, chatId, agentId });
    
    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete chat" },
      { status }
    );
    
    return addCorsHeaders(response, corsResult.origin);
  }
}

