/**
 * Rooms Service - Business logic for agent rooms
 * Uses direct DB access via repositories instead of spinning up runtime
 */

import {
  roomsRepository,
  memoriesRepository,
  participantsRepository,
  entitiesRepository,
  type Room,
  type RoomWithPreview,
} from "@/db/repositories";
import { db } from "@/db/client";
import { roomTable, entityTable, participantTable } from "@/db/schemas/eliza";
import type { Memory } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { v4 as uuidv4 } from "uuid";
import { eq, sql } from "drizzle-orm";

/**
 * Input for creating a room.
 */
export interface CreateRoomInput {
  id?: string; // Allow passing a pre-generated room ID
  agentId?: string; // Optional - will be set when runtime initializes
  entityId: string;
  source?: string;
  type?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Room with associated messages.
 */
export interface RoomWithMessages {
  room: Room;
  messages: Memory[];
  participants: string[];
}

/**
 * Room preview for sidebar/list views
 * Transformed from RoomWithPreview for API response
 */
export interface RoomPreview {
  id: string;
  title?: string; // room name or generated title
  characterId?: string; // agentId from room
  lastTime?: number; // from last message createdAt (ms timestamp)
  lastText?: string; // from last message content.text (truncated)
}

// Re-export for convenience
export type { RoomWithPreview };

export class RoomsService {
  /**
   * Get room by ID with messages
   */
  async getRoomWithMessages(
    roomId: string,
    limit = 50,
    afterTimestamp?: number,
  ): Promise<RoomWithMessages | null> {
    const [room, messages, participantIds] = await Promise.all([
      roomsRepository.findById(roomId),
      memoriesRepository.findMessages(roomId, { limit, afterTimestamp }),
      participantsRepository.getEntityIdsByRoomId(roomId),
    ]);

    if (!room) {
      return null;
    }

    return {
      room,
      messages: messages.reverse(), // Reverse to get chronological order
      participants: participantIds,
    };
  }

  /**
   * Get rooms for an entity (user) with last message preview
   * Uses a single optimized query - no N+1 problem
   *
   * @param entityId - The user's ID (from auth)
   * @returns Room previews sorted by most recent activity
   */
  async getRoomsForEntity(entityId: string): Promise<RoomPreview[]> {
    // Single query: participants → rooms → last message
    const roomsWithPreview =
      await roomsRepository.findRoomsWithPreviewForEntity(entityId);

    // Transform to API response format
    return roomsWithPreview.map((room) => ({
      id: room.id,
      title: room.name || undefined,
      characterId: room.characterId || undefined,
      lastTime: room.lastMessageTime?.getTime() || room.createdAt?.getTime(),
      lastText: room.lastMessageText?.substring(0, 100) || undefined,
    }));
  }

  /**
   * Create a new room with entity as participant
   * If agentId is not provided, we create a minimal room that will be
   * fully initialized when the first message is sent (runtime handles it)
   *
   * When agentId is provided, uses a database transaction to ensure
   * room + entity + participant are created atomically.
   */
  async createRoom(input: CreateRoomInput): Promise<Room> {
    const roomId = input.id || uuidv4();

    // Create room with agentId - required for ElizaOS room lookup
    // The API route ensures agent exists before calling this
    // ElizaOS's ensureConnection creates entity/participant when first message is sent
    const [room] = await db
      .insert(roomTable)
      .values({
        id: roomId,
        agentId: input.agentId || null,
        source: input.source || "web",
        type: input.type || "DM",
        name: input.name,
        metadata: input.metadata,
        createdAt: new Date(),
      })
      .returning();

    logger.info(
      `[Rooms Service] Created room ${roomId} for entity ${input.entityId || "none"} with agent ${input.agentId || "none"}`,
    );
    return room;
  }

  /**
   * Update room metadata
   */
  async updateMetadata(
    roomId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await roomsRepository.updateMetadata(roomId, metadata);
  }

  /**
   * Delete room and all related data
   */
  async deleteRoom(roomId: string): Promise<void> {
    logger.info(`[Rooms Service] Deleting room ${roomId}`);

    // Delete in order: messages, participants, then room
    // (CASCADE should handle most of this, but explicit is better)
    await Promise.all([
      memoriesRepository.deleteMessages(roomId),
      participantsRepository.deleteByRoomId(roomId),
    ]);

    await roomsRepository.delete(roomId);

    logger.info(`[Rooms Service] Successfully deleted room ${roomId}`);
  }

  /**
   * Get room summary with message count and last message
   */
  async getRoomSummary(roomId: string): Promise<{
    roomId: string;
    messageCount: number;
    participantCount: number;
    lastMessage?: { time: number; text: string };
  } | null> {
    const [room, messageCount, participantCount, lastMessage] =
      await Promise.all([
        roomsRepository.findById(roomId),
        memoriesRepository.countMessages(roomId),
        participantsRepository.countByRoomId(roomId),
        memoriesRepository.findLastMessageForRoom(roomId),
      ]);

    if (!room) {
      return null;
    }

    return {
      roomId: room.id,
      messageCount,
      participantCount,
      lastMessage: lastMessage
        ? {
            time: lastMessage.createdAt || Date.now(),
            text: ((lastMessage.content?.text as string) || "").substring(
              0,
              100,
            ),
          }
        : undefined,
    };
  }

  /**
   * Check if entity has access to room
   * Grants access if:
   * 1. Entity is a participant in the room, OR
   * 2. Entity is the room creator (stored in metadata)
   */
  async hasAccess(roomId: string, entityId: string): Promise<boolean> {
    // First check if user is a participant
    const isParticipant = await participantsRepository.isParticipant(roomId, entityId);
    if (isParticipant) {
      return true;
    }

    // If not a participant, check if user is the room creator
    const room = await roomsRepository.findById(roomId);
    if (!room) {
      return false;
    }

    interface RoomMetadata {
      creatorUserId?: string;
      [key: string]: unknown;
    }
    const metadata = (room.metadata as RoomMetadata | null) ?? {};
    const isCreator = metadata.creatorUserId === entityId;

    return isCreator;
  }

  /**
   * Add participant to room
   */
  async addParticipant(
    roomId: string,
    entityId: string,
    agentId: string,
  ): Promise<void> {
    // Ensure entity exists
    await entitiesRepository.create({
      id: entityId,
      agentId,
      names: [entityId],
    });

    // Add as participant
    await participantsRepository.create({
      roomId,
      entityId,
      agentId,
    });

    logger.info(
      `[Rooms Service] Added participant ${entityId} to room ${roomId}`,
    );
  }

  /**
   * Get rooms by agent (for analytics)
   */
  async getRoomsByAgent(agentId: string, limit = 50): Promise<Room[]> {
    return await roomsRepository.findByAgentId(agentId, limit);
  }
}

export const roomsService = new RoomsService();
