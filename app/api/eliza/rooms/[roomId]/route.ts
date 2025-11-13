import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID, Agent } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser } from "@/lib/auth-anonymous";
import type { NextRequest } from "next/server";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { charactersService } from "@/lib/services";

// GET /api/eliza/rooms/[roomId] - Get room details and messages
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

    const runtime = await agentRuntime.getRuntime();
    const rawMessages = await runtime.getMemories({
      tableName: "messages",
      roomId: roomId as UUID,
      count: limit ? parseInt(limit) : 50,
      unique: false,
    });

    const simple = rawMessages
      .map((msg) => {
        let parsedContent: unknown = msg.content;
        try {
          if (typeof msg.content === "string")
            parsedContent = JSON.parse(msg.content);
        } catch {
          parsedContent = msg.content;
        }
        return {
          id: msg.id,
          entityId: msg.entityId,
          agentId: msg.agentId,
          content: parsedContent,
          createdAt: (msg as { createdAt: number }).createdAt,
          isAgent: msg.entityId === msg.agentId,
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);

    // Look up character for this room
    let characterId: string | undefined;
    try {
      const roomCharacter =
        await elizaRoomCharactersRepository.findByRoomId(roomId);
      if (roomCharacter) {
        characterId = roomCharacter.character_id;
      }
    } catch (err) {
      logger.warn(
        "[Eliza Room API] Failed to get character for room:",
        roomId,
        err,
      );
    }

    // Get agent info including avatar
    // If room has a specific character, get avatar directly from character DB
    let agent: Agent | null = null;
    let avatarUrl: string | undefined;
    let agentName: string | undefined;

    if (characterId) {
      // Get character from database to get avatar URL
      try {
        const dbCharacter = await charactersService.getById(characterId);
        if (dbCharacter) {
          avatarUrl = dbCharacter.avatar_url ?? undefined;
          agentName = dbCharacter.name;
        }
        // Get agent for other info (but not avatar - that's character-specific)
        const characterRuntime =
          await agentRuntime.getRuntimeForCharacter(characterId);
        agent = await characterRuntime.getAgent(characterRuntime.agentId);
      } catch (err) {
        logger.warn(
          "[Eliza Room API] Failed to load character, using default:",
          err,
        );
        // Fall back to default agent
        agent = await runtime.getAgent(runtime.agentId);
        agentName = agent?.name;
      }
    } else {
      // Use default agent
      agent = await runtime.getAgent(runtime.agentId);
      agentName = agent?.name;
    }

    return NextResponse.json(
      {
        success: true,
        roomId,
        messages: simple,
        count: simple.length,
        characterId,
        agent: {
          id: agent?.id,
          name: agentName,
          avatarUrl,
        },
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

// DELETE /api/eliza/rooms/[roomId] - Delete a room and all related data
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

    // Delete character mapping first (if exists)
    try {
      await elizaRoomCharactersRepository.delete(roomId);
      logger.debug(
        "[Eliza Room API] Deleted character mapping for room:",
        roomId,
      );
    } catch (err) {
      logger.warn(
        "[Eliza Room API] No character mapping to delete:",
        roomId,
        err,
      );
    }

    // Clear connection cache for this room
    try {
      // The connectionCache might have entries for this room
      // We'll let it naturally expire or clear by roomId if the cache supports it
      logger.debug(
        "[Eliza Room API] Cleared connection cache for room:",
        roomId,
      );
    } catch (err) {
      logger.warn("[Eliza Room API] Failed to clear connection cache:", err);
    }

    // Delete the room from database (CASCADE will handle related records)
    // This will automatically delete:
    // - memories (messages) associated with the room
    // - participants in the room
    // - any other related records with CASCADE constraints
    await db.execute(sql`DELETE FROM rooms WHERE id = ${roomId}::uuid`);

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
