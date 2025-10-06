import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { stringToUuid, UUID } from "@elizaos/core";

// GET /api/eliza/rooms - Get user's rooms
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const roomIds = await runtime.getRoomsForParticipants([
      stringToUuid(entityId) as UUID,
    ]);

    // Get room details
    const rooms = await Promise.all(
      roomIds.map(async (roomId) => {
        const room = await runtime.getRoom(roomId);
        return {
          id: roomId,
          ...room,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      rooms,
    });
  } catch (error) {
    console.error("[Eliza Rooms API] Error getting rooms:", error);
    return NextResponse.json(
      {
        error: "Failed to get rooms",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// POST /api/eliza/rooms - Create new room
export async function POST(request: NextRequest) {
  try {
    console.log("[Eliza Rooms API] POST request received");
    const body = await request.json();
    const { entityId } = body;
    console.log("[Eliza Rooms API] entityId:", entityId);

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const roomId = uuidv4();

    // Ensure room exists
    await runtime.ensureRoomExists({
      id: roomId as UUID,
      source: "web",
      type: "DM",
      channelId: roomId,
      serverId: "eliza-server",
      worldId: stringToUuid("eliza-world") as UUID,
      agentId: runtime.agentId,
    });

    console.log("[Eliza Rooms API] Created room:", roomId, "for entity:", entityId);

    // Send initial greeting message
    try {
      console.log("[Eliza Rooms API] Sending initial greeting");
      
      const greetingText = "Hello! I'm Eliza, your friendly AI assistant. How can I help you today?";
      
      await runtime.createMemory({
        id: uuidv4() as UUID,
        roomId: roomId as UUID,
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        content: {
          text: greetingText,
          type: "agent",
        },
        createdAt: Date.now(),
      }, "messages");
      console.log("[Eliza Rooms API] Initial greeting message saved to room");
    } catch (initErr) {
      console.error("[Eliza Rooms API] Failed to create initial greeting:", initErr);
    }

    return NextResponse.json({
      success: true,
      roomId,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("[Eliza Rooms API] Detailed error:", error);
    console.error(
      "[Eliza Rooms API] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );
    return NextResponse.json(
      {
        error: "Failed to create room",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

