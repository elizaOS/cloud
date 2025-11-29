/**
 * Repository for ElizaOS Rooms table
 * Handles all database operations for rooms without spinning up runtime
 */

import { db } from "@/db/client";
import { roomTable, participantTable, memoryTable } from "@/db/schemas/eliza";
import { eq, inArray, sql, desc, and } from "drizzle-orm";
import type { Room as BaseRoom } from "@elizaos/core";

// Use core Room type directly
export type Room = BaseRoom;

/**
 * Room with last message preview - for sidebar/list views
 * All data comes from a single optimized query
 */
export interface RoomWithPreview {
  id: string;
  name: string | null;
  characterId: string | null; // agentId from room
  createdAt: Date;
  lastMessageTime: Date | null;
  lastMessageText: string | null;
}

export interface CreateRoomInput {
  id: string;
  agentId?: string; // Optional - can be set later when runtime initializes
  source?: string;
  type?: string;
  name?: string;
  serverId?: string;
  channelId?: string;
  worldId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateRoomInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export class RoomsRepository {
  /**
   * Get room by ID
   */
  async findById(roomId: string): Promise<Room | null> {
    const result = await db
      .select()
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get multiple rooms by IDs
   */
  async findByIds(roomIds: string[]): Promise<Room[]> {
    if (roomIds.length === 0) return [];

    const results = await db
      .select()
      .from(roomTable)
      .where(inArray(roomTable.id, roomIds));

    return results;
  }

  /**
   * Find rooms by agent ID, sorted by last activity
   */
  async findByAgentId(agentId: string, limit = 50): Promise<Room[]> {
    const results = await db
      .select()
      .from(roomTable)
      .where(eq(roomTable.agentId, agentId));

    // Sort by lastTime from metadata in memory
    const sorted = results.sort((a, b) => {
      const timeA = (a.metadata?.lastTime as number) || 0;
      const timeB = (b.metadata?.lastTime as number) || 0;
      return timeB - timeA; // Descending
    });

    return sorted.slice(0, limit);
  }

  /**
   * Create a new room
   */
  async create(input: CreateRoomInput): Promise<Room> {
    const [room] = await db
      .insert(roomTable)
      .values({
        id: input.id,
        agentId: input.agentId,
        source: input.source,
        type: input.type,
        name: input.name,
        serverId: input.serverId,
        channelId: input.channelId,
        worldId: input.worldId,
        metadata: input.metadata,
        createdAt: new Date(),
      })
      .returning();

    return room;
  }

  /**
   * Update room
   */
  async update(roomId: string, input: UpdateRoomInput): Promise<Room> {
    const [room] = await db
      .update(roomTable)
      .set(input)
      .where(eq(roomTable.id, roomId))
      .returning();

    return room;
  }

  /**
   * Delete room
   */
  async delete(roomId: string): Promise<void> {
    await db.delete(roomTable).where(eq(roomTable.id, roomId));
  }

  /**
   * Check if room exists
   */
  async exists(roomId: string): Promise<boolean> {
    const result = await db
      .select({ id: roomTable.id })
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Count rooms by agent
   */
  async countByAgentId(agentId: string): Promise<number> {
    const results = await db
      .select()
      .from(roomTable)
      .where(eq(roomTable.agentId, agentId));

    return results.length;
  }

  /**
   * Update room metadata (merge with existing)
   */
  async updateMetadata(
    roomId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Read current metadata
    const room = await this.findById(roomId);
    if (!room) return;

    const currentMetadata = room.metadata || {};

    // Merge and write back
    await db
      .update(roomTable)
      .set({
        metadata: {
          ...currentMetadata,
          ...metadata,
        },
      })
      .where(eq(roomTable.id, roomId));
  }

  /**
   * Get character ID for a room (from metadata)
   */
  async getCharacterId(roomId: string): Promise<string | null> {
    const room = await this.findById(roomId);
    return (room?.metadata?.characterId as string) || null;
  }

  /**
   * Set character ID for a room (in metadata)
   */
  async setCharacterId(roomId: string, characterId: string): Promise<void> {
    await this.updateMetadata(roomId, { characterId });
  }

  /**
   * Get character IDs for multiple rooms
   */
  async getCharacterIds(roomIds: string[]): Promise<Map<string, string>> {
    if (roomIds.length === 0) return new Map();

    const rooms = await this.findByIds(roomIds);
    const map = new Map<string, string>();
    
    for (const room of rooms) {
      const characterId = room.metadata?.characterId as string | undefined;
      if (characterId) {
        map.set(room.id, characterId);
      }
    }

    return map;
  }

  /**
   * Get all rooms for an entity (user) with last message preview
   * Uses Drizzle joins for type safety
   * 
   * @param entityId - The user's ID (from auth)
   * @returns Rooms with preview data, sorted by most recent activity
   */
  async findRoomsWithPreviewForEntity(entityId: string): Promise<RoomWithPreview[]> {
    // Step 1: Get all room IDs for this entity via participants
    const participantRooms = await db
      .select({ roomId: participantTable.roomId })
      .from(participantTable)
      .where(eq(participantTable.entityId, entityId));

    if (participantRooms.length === 0) {
      return [];
    }

    const roomIds = participantRooms.map(p => p.roomId);

    // Step 2: Get rooms with their data
    const rooms = await db
      .select({
        id: roomTable.id,
        name: roomTable.name,
        characterId: roomTable.agentId,
        createdAt: roomTable.createdAt,
      })
      .from(roomTable)
      .where(inArray(roomTable.id, roomIds));

    // Step 3: Get last message for each room (single query, dedupe in memory)
    const lastMessages = await db
      .select({
        roomId: memoryTable.roomId,
        createdAt: memoryTable.createdAt,
        content: memoryTable.content,
      })
      .from(memoryTable)
      .where(
        and(
          inArray(memoryTable.roomId, roomIds),
          eq(memoryTable.type, "messages"),
        ),
      )
      .orderBy(desc(memoryTable.createdAt));

    // Dedupe to get only the last message per room
    const lastMessageByRoom = new Map<string, { createdAt: Date | null; text: string | null }>();
    for (const msg of lastMessages) {
      if (!lastMessageByRoom.has(msg.roomId)) {
        lastMessageByRoom.set(msg.roomId, {
          createdAt: msg.createdAt,
          text: (msg.content?.text as string) || null,
        });
      }
    }

    // Step 4: Combine and sort by most recent activity
    const result: RoomWithPreview[] = rooms.map(room => {
      const lastMsg = lastMessageByRoom.get(room.id);
      return {
        id: room.id,
        name: room.name,
        characterId: room.characterId,
        createdAt: room.createdAt || new Date(),
        lastMessageTime: lastMsg?.createdAt || null,
        lastMessageText: lastMsg?.text || null,
      };
    });

    // Sort by last message time, falling back to room creation time
    result.sort((a, b) => {
      const timeA = a.lastMessageTime?.getTime() || a.createdAt.getTime();
      const timeB = b.lastMessageTime?.getTime() || b.createdAt.getTime();
      return timeB - timeA;
    });

    return result;
  }
}

export const roomsRepository = new RoomsRepository();

