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
import type { Memory } from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { v4 as uuidv4 } from "uuid";

export interface CreateRoomInput {
  id?: string; // Allow passing a pre-generated room ID
  agentId?: string; // Optional - will be set when runtime initializes
  entityId: string;
  source?: string;
  type?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

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
  title?: string;       // room name or generated title
  characterId?: string; // agentId from room
  lastTime?: number;    // from last message createdAt (ms timestamp)
  lastText?: string;    // from last message content.text (truncated)
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
    try {
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
    } catch (error) {
      logger.error(`[Rooms Service] Error getting room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Get rooms for an entity (user) with last message preview
   * Uses a single optimized query - no N+1 problem
   * 
   * @param entityId - The user's ID (from auth)
   * @returns Room previews sorted by most recent activity
   */
  async getRoomsForEntity(entityId: string): Promise<RoomPreview[]> {
    try {
      // Single query: participants → rooms → last message
      const roomsWithPreview = await roomsRepository.findRoomsWithPreviewForEntity(entityId);

      // Transform to API response format
      return roomsWithPreview.map(room => ({
        id: room.id,
        title: room.name || undefined,
        characterId: room.characterId || undefined,
        lastTime: room.lastMessageTime?.getTime() || room.createdAt?.getTime(),
        lastText: room.lastMessageText?.substring(0, 100) || undefined,
      }));
    } catch (error) {
      logger.error(
        `[Rooms Service] Error getting rooms for entity ${entityId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a new room with entity as participant
   * If agentId is not provided, we create a minimal room that will be
   * fully initialized when the first message is sent (runtime handles it)
   */
  async createRoom(input: CreateRoomInput): Promise<Room> {
    try {
      const roomId = input.id || uuidv4();

      // Create room (agentId can be null for pre-created rooms)
      const room = await roomsRepository.create({
        id: roomId,
        agentId: input.agentId,
        source: input.source || "web",
        type: input.type || "DM",
        name: input.name,
        metadata: input.metadata,
      });

      // Only create entity/participant if agentId is provided
      // Otherwise, runtime will handle this on first message
      if (input.agentId) {
        // Ensure entity exists
        await entitiesRepository.create({
          id: input.entityId,
          agentId: input.agentId,
          names: [input.entityId],
        });

        // Add entity as participant
        await participantsRepository.create({
          roomId,
          entityId: input.entityId,
          agentId: input.agentId,
        });
      }

      logger.info(
        `[Rooms Service] Created room ${roomId} for entity ${input.entityId}`,
      );
      return room;
    } catch (error) {
      logger.error("[Rooms Service] Error creating room:", error);
      throw error;
    }
  }

  /**
   * Update room metadata
   */
  async updateMetadata(
    roomId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await roomsRepository.updateMetadata(roomId, metadata);
    } catch (error) {
      logger.error(
        `[Rooms Service] Error updating room ${roomId} metadata:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete room and all related data
   */
  async deleteRoom(roomId: string): Promise<void> {
    try {
      logger.info(`[Rooms Service] Deleting room ${roomId}`);

      // Delete in order: messages, participants, then room
      // (CASCADE should handle most of this, but explicit is better)
      await Promise.all([
        memoriesRepository.deleteMessages(roomId),
        participantsRepository.deleteByRoomId(roomId),
      ]);

      await roomsRepository.delete(roomId);

      logger.info(`[Rooms Service] Successfully deleted room ${roomId}`);
    } catch (error) {
      logger.error(`[Rooms Service] Error deleting room ${roomId}:`, error);
      throw error;
    }
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
    try {
      const [room, messageCount, participantCount, lastMessage] = await Promise.all([
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
        lastMessage: lastMessage ? {
          time: lastMessage.createdAt || Date.now(),
          text: ((lastMessage.content?.text as string) || "").substring(0, 100),
        } : undefined,
      };
    } catch (error) {
      logger.error(
        `[Rooms Service] Error getting room summary ${roomId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if entity has access to room
   */
  async hasAccess(roomId: string, entityId: string): Promise<boolean> {
    try {
      return await participantsRepository.isParticipant(roomId, entityId);
    } catch (error) {
      logger.error(
        `[Rooms Service] Error checking access for room ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Add participant to room
   */
  async addParticipant(
    roomId: string,
    entityId: string,
    agentId: string,
  ): Promise<void> {
    try {
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
    } catch (error) {
      logger.error(
        `[Rooms Service] Error adding participant to room ${roomId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get rooms by agent (for analytics)
   */
  async getRoomsByAgent(agentId: string, limit = 50): Promise<Room[]> {
    try {
      return await roomsRepository.findByAgentId(agentId, limit);
    } catch (error) {
      logger.error(
        `[Rooms Service] Error getting rooms for agent ${agentId}:`,
        error,
      );
      throw error;
    }
  }
}

export const roomsService = new RoomsService();
