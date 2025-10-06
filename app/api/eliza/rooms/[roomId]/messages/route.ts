import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";

// POST /api/eliza/rooms/[roomId]/messages - Send a message
export async function POST(request: Request, ctx: { params: { roomId: string } }) {
  try {
    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, attachments } = body;

    if (!roomId) {
      console.error("[Eliza Messages API] Missing roomId");
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    if (!entityId) {
      console.error("[Eliza Messages API] Missing entityId");
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.error("[Eliza Messages API] Invalid or missing text", { text });
      return NextResponse.json(
        { error: "text is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Handle the message
    const message = await agentRuntime.handleMessage(roomId, entityId, {
      text,
      attachments: attachments || [],
    });

    console.log(`[Eliza Messages API] Message sent successfully`, {
      roomId,
      entityId,
      messageId: message.id,
    });

    // Return the created message
    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        entityId: message.entityId || "",
        agentId: message.agentId,
        content: message.content,
        createdAt: message.createdAt,
        roomId,
      },
      // Include polling hint for the client
      pollForResponse: true,
      pollDuration: 30000, // 30 seconds
      pollInterval: 1000, // 1 second
    });
  } catch (error) {
    console.error("[Eliza Messages API] Error sending message:", error);

    // Provide more specific error messages based on the error type
    if (error instanceof TypeError) {
      return NextResponse.json(
        {
          error: "Invalid request format",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// GET /api/eliza/rooms/[roomId]/messages - Get messages (for polling)
export async function GET(request: Request, ctx: { params: { roomId: string } }) {
  try {
    const { roomId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const afterTimestamp = searchParams.get("afterTimestamp");

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const messages = await runtime.getMemories({
      tableName: "messages",
      roomId: roomId as UUID,
      count: limit ? parseInt(limit) : 100, // Higher count for polling to catch all new messages
      unique: false,
    });

    // Filter messages by timestamp if provided (for polling)
    const afterTimestampNum = afterTimestamp ? parseInt(afterTimestamp) : 0;
    const filteredMessages = afterTimestamp
      ? messages.filter((msg) => {
          const msgTime = (msg as { createdAt: number }).createdAt;
          return msgTime > afterTimestampNum;
        })
      : messages;

    const simple = filteredMessages.map((msg) => {
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
    });

    return NextResponse.json(
      {
        success: true,
        messages: simple,
        hasMore: false,
        lastTimestamp:
          simple.length > 0 ? simple[simple.length - 1].createdAt : Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Eliza Messages API] Error getting messages:", error);
    return NextResponse.json(
      {
        error: "Failed to get messages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

