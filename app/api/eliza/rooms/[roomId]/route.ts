import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

// GET /api/eliza/rooms/[roomId] - Get room details and messages
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Authenticate user or validate API key
    await requireAuthOrApiKey(request);

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

    // Get agent info including avatar
    const agent = await runtime.getAgent(runtime.agentId);
    const avatarUrl = agent?.settings?.avatarUrl as string | undefined;

    // Look up character for this room
    let characterId: string | undefined;
    try {
      const roomCharacter =
        await elizaRoomCharactersRepository.findByRoomId(roomId);
      if (roomCharacter) {
        characterId = roomCharacter.character_id;
        logger.debug("[Eliza Room API] Room has character:", characterId);
      }
    } catch (err) {
      logger.warn(
        "[Eliza Room API] Failed to get character for room:",
        roomId,
        err,
      );
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
          name: agent?.name,
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
