/**
 * /api/eliza/rooms/:roomId
 *
 * GET: room details + paginated messages.
 * PATCH: update room metadata or name.
 * DELETE: hard-delete the room and all related data.
 *
 * Access requires the caller (authed user or matched anonymous session) to
 * be a participant of the room.
 */

import type { Memory } from "@elizaos/core";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

import { conversationsRepository, roomsRepository } from "@/db/repositories";
import { agentsService } from "@/lib/services/agents/agents";
import { roomsService } from "@/lib/services/agents/rooms";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { parseMessageContent } from "@/lib/types/message-content";
import { usersService } from "@/lib/services/users";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKey } from "@/api-lib/auth";
import type { AppContext, AppEnv } from "@/api-lib/context";

const ANON_SESSION_COOKIE = "eliza-anon-session";

async function resolveAnonymousUserId(c: AppContext): Promise<string | null> {
  const token = getCookie(c, ANON_SESSION_COOKIE);
  if (!token) return null;
  const session = await anonymousSessionsService.getByToken(token);
  if (!session) return null;
  const user = await usersService.getById(session.user_id);
  if (!user || !user.is_anonymous) return null;
  return user.id;
}

async function resolveUserId(c: AppContext): Promise<string | null> {
  try {
    const u = await requireUserOrApiKey(c);
    return u.id;
  } catch {
    return resolveAnonymousUserId(c);
  }
}

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const roomId = c.req.param("roomId") ?? "";
  const limit = c.req.query("limit");
  if (!roomId) return c.json({ error: "roomId is required" }, 400);

  const hasAccess = await roomsService.hasAccess(roomId, userId);
  if (!hasAccess) {
    logger.warn(
      `[Eliza Room API] Access denied: User ${userId} attempted to access room ${roomId}`,
    );
    return c.json({ error: "You don't have permission to access this room" }, 403);
  }

  const roomData = await roomsService.getRoomWithMessages(roomId, limit ? parseInt(limit) : 50);

  if (!roomData) {
    const conversation = await conversationsRepository.findById(roomId);
    if (conversation) {
      return c.json(
        {
          success: true,
          roomId,
          messages: [],
          count: 0,
          characterId: undefined,
          agent: { id: "default", name: "Eliza", avatarUrl: undefined },
          metadata: {},
        },
        200,
        { "Cache-Control": "no-store" },
      );
    }
    return c.json({ error: "Room not found" }, 404);
  }

  const characterId = roomData.room.agentId || undefined;
  if (characterId) {
    logger.info("[Eliza Room API] Loading room with character:", characterId);
  } else {
    logger.info("[Eliza Room API] Loading room with default character");
  }

  const messages = roomData.messages.map((msg: Memory) => {
    const content = parseMessageContent(msg.content);
    if (content?.source === "agent" && content?.attachments) {
      logger.info(
        `[Eliza Room API] Message ${msg.id?.substring(0, 8)} has ${content.attachments.length} attachment(s)`,
      );
    }
    const isAgentBySource = content?.source === "agent";
    const isAgentByEntityId = msg.entityId === msg.agentId;
    const isAgent = content?.source ? isAgentBySource : isAgentByEntityId;
    return {
      id: msg.id,
      entityId: msg.entityId,
      agentId: msg.agentId,
      content,
      createdAt: msg.createdAt || Date.now(),
      isAgent,
    };
  });

  logger.info(`[Eliza Room API] Returning ${messages.length} messages for room ${roomId}`);

  const agentIdToLookup = characterId || roomData.room.agentId;
  const agentInfo = agentIdToLookup
    ? (await agentsService.getDisplayInfo(agentIdToLookup)) || {
        id: agentIdToLookup,
        name: "Eliza",
        avatarUrl: undefined,
      }
    : { id: "default", name: "Eliza", avatarUrl: undefined };

  return c.json(
    {
      success: true,
      roomId,
      messages,
      count: messages.length,
      characterId,
      agent: agentInfo,
      metadata: roomData.room.metadata || {},
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

app.patch("/", async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const roomId = c.req.param("roomId") ?? "";
  if (!roomId) return c.json({ error: "roomId is required" }, 400);

  const hasAccess = await roomsService.hasAccess(roomId, userId);
  if (!hasAccess) {
    logger.warn(
      `[Eliza Room API] Access denied: User ${userId} attempted to update room ${roomId}`,
    );
    return c.json({ error: "You don't have permission to update this room" }, 403);
  }

  const body = (await c.req.json()) as {
    metadata?: Record<string, unknown>;
    name?: string;
  };

  if (!body.metadata && !body.name) {
    return c.json({ error: "metadata or name is required" }, 400);
  }
  if (body.metadata && typeof body.metadata !== "object") {
    return c.json({ error: "metadata must be an object" }, 400);
  }

  if (body.metadata) await roomsService.updateMetadata(roomId, body.metadata);
  if (body.name) await roomsRepository.update(roomId, { name: body.name });

  const updatedFields = [body.metadata && "metadata", body.name && "name"].filter(Boolean);
  logger.info("[Eliza Room API] Room updated:", roomId);

  return c.json({
    success: true,
    message: `Room ${updatedFields.join(" and ")} updated successfully`,
    roomId,
  });
});

app.delete("/", async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const roomId = c.req.param("roomId") ?? "";
  if (!roomId) return c.json({ error: "roomId is required" }, 400);

  const hasAccess = await roomsService.hasAccess(roomId, userId);
  if (!hasAccess) {
    logger.warn(
      `[Eliza Room API] Access denied: User ${userId} attempted to delete room ${roomId}`,
    );
    return c.json({ error: "You don't have permission to delete this room" }, 403);
  }

  logger.info("[Eliza Room API] Deleting room:", roomId, "by user:", userId);
  await roomsService.deleteRoom(roomId);
  logger.info("[Eliza Room API] Room deleted successfully:", roomId);

  return c.json({ success: true, message: "Room deleted successfully", roomId });
});

export default app;
