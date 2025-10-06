import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";

// GET /api/eliza/rooms/[roomId] - Get room details and messages
export async function GET(
  request: Request,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
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

    return NextResponse.json(
      {
        success: true,
        roomId,
        messages: simple,
        count: simple.length,
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
