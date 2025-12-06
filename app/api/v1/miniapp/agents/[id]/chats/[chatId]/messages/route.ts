/**
 * /api/v1/miniapp/agents/[id]/chats/[chatId]/messages
 *
 * POST - Send a message to the agent
 *
 * This endpoint validates access and then forwards to the main streaming endpoint.
 * For streaming responses, miniapp should use:
 *   POST /api/eliza/rooms/[chatId]/messages/stream
 *   with body: { text, model?, agentMode? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { roomTable, participantTable } from "@/db/schemas/eliza";
import { eq, and } from "drizzle-orm";
import type { UUID } from "@elizaos/core";
import { z } from "zod";
import type { RoomMetadata } from "@/lib/types/message-content";

export const maxDuration = 60;

/**
 * OPTIONS /api/v1/miniapp/agents/[id]/chats/[chatId]/messages
 * CORS preflight handler for miniapp message endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

const SendMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  model: z.string().optional(),
});

/**
 * POST /api/v1/miniapp/agents/[id]/chats/[chatId]/messages
 * Validates access to send a message and returns the streaming endpoint URL.
 * The client should then POST to the returned streamUrl for the actual streaming response.
 *
 * Request Body:
 * - `text`: Message text (required, 1-10000 characters).
 * - `model`: Optional model ID to use.
 *
 * @param request - Request body with message text and optional model.
 * @param params - Route parameters containing the agent ID and chat ID.
 * @returns Streaming endpoint URL and message details for client to use.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const corsResult = await validateOrigin(request);
  const { id: agentId, chatId } = await params;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Parse and validate body
    const body = await request.json();
    const validationResult = SendMessageSchema.safeParse(body);

    if (!validationResult.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const { text, model } = validationResult.data;

    // Verify agent exists and user has access
    const character = await charactersService.getById(agentId);

    if (!character) {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify this is a miniapp agent - miniapp API can only access miniapp-created agents
    if (character.source !== "miniapp") {
      const response = NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    if (
      character.user_id !== user.id &&
      character.organization_id !== user.organization_id &&
      !character.is_public
    ) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Verify room exists and user has access
    const room = await db.query.roomTable.findFirst({
      where: eq(roomTable.id, chatId as UUID),
    });

    if (!room) {
      const response = NextResponse.json(
        { success: false, error: "Chat not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Check if user has access - either via participant record OR as the creator
    const userParticipant = await db.query.participantTable.findFirst({
      where: and(
        eq(participantTable.roomId, chatId as UUID),
        eq(participantTable.entityId, user.id as UUID),
      ),
    });

    // Check if user is the room creator (stored in metadata)
    const metadata = (room.metadata as RoomMetadata | null) ?? {};
    const isCreator = metadata.creatorUserId === user.id;

    if (!userParticipant && !isCreator) {
      const response = NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Return success with streaming URL
    // The client should use this URL to POST the message for streaming
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const streamUrl = `${baseUrl}/api/eliza/rooms/${chatId}/messages/stream`;

    logger.info("[Miniapp API] Message access validated", {
      chatId,
      agentId,
      userId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      streamUrl,
      roomId: chatId,
      agentId,
      message: {
        text,
        model,
      },
      instructions:
        "POST to streamUrl with body { text, model? } for streaming response",
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error validating message", {
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
        error:
          error instanceof Error ? error.message : "Failed to validate message",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}
