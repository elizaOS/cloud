import { NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import type { NextRequest } from "next/server";
import { roomsService } from "@/lib/services/agents/rooms";
import { agentsService } from "@/lib/services/agents/agents";
import { logger } from "@/lib/utils/logger";
import type { Memory } from "@elizaos/core";

/**
 * GET /api/eliza/rooms/[roomId] - Get room details and messages
 * 
 * Pure database operation - no runtime needed
 * Uses agentsService to get agent display info
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Support both authenticated and anonymous users
    try {
      await requireAuthOrApiKey(request);
    } catch (error) {
      // Fallback to anonymous user
      await getAnonymousUser();
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

    // Format messages for response
    const simple = roomData.messages.map((msg) => {
        let parsedContent: unknown = msg.content;
        try {
          if (typeof msg.content === "string")
          parsedContent = JSON.parse(msg.content as string);
        } catch {
          parsedContent = msg.content;
        }
        return {
          id: msg.id,
          entityId: msg.entityId,
          agentId: msg.agentId,
          content: parsedContent,
        createdAt: msg.createdAt || Date.now(),
          isAgent: msg.entityId === msg.agentId,
        };
    });

    // Get agent display info from database (no runtime needed!)
    let agentInfo: { id: string; name: string; avatarUrl?: string } | null = null;
    
    if (characterId) {
      // Try to get agent info from agents table
      agentInfo = await agentsService.getDisplayInfo(characterId);
    }
    
    // If no agent info found, try the room's agentId
    if (!agentInfo && roomData.room.agentId) {
      agentInfo = await agentsService.getDisplayInfo(roomData.room.agentId);
    }
    
    // Fallback to default values if agent not found in DB
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
  } catch (error) {
    console.error("[Eliza Room API] Error getting room:", error);
    return NextResponse.json(
      {
        error: "Failed to get room",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/eliza/rooms/[roomId] - Delete a room and all related data
 * 
 * Pure database operation - no runtime needed
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Support both authenticated and anonymous users
    try {
      await requireAuthOrApiKey(request);
    } catch (error) {
      // Fallback to anonymous user
      await getAnonymousUser();
    }

    const { roomId } = await ctx.params;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    logger.info("[Eliza Room API] Deleting room:", roomId);

    // Use rooms service to delete room and all related data
    await roomsService.deleteRoom(roomId);

    logger.info("[Eliza Room API] ✓ Room deleted successfully:", roomId);

    return NextResponse.json({
      success: true,
      message: "Room deleted successfully",
      roomId,
    });
  } catch (error) {
    logger.error("[Eliza Room API] Error deleting room:", error);
    return NextResponse.json(
      {
        error: "Failed to delete room",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
