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
  agentId?: string;
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
   * Note: source and type are required in the database (notNull, no defaults)
   */
  async create(input: CreateRoomInput): Promise<Room> {
    const [room] = await db
      .insert(roomTable)
      .values({
        id: input.id,
        agentId: input.agentId,
        source: input.source || "web",
        type: input.type || "DIRECT",
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
   * Get all rooms for an entity (user) with last message preview
   * Uses a single optimized query with joins
   * 
   * @param entityId - The user's ID (from auth)
   * @returns Rooms with preview data, sorted by most recent activity
   */
  async findRoomsWithPreviewForEntity(entityId: string): Promise<RoomWithPreview[]> {
    // Use a subquery to get the latest message per room
    const latestMessagesSubquery = db
      .select({
        roomId: memoryTable.roomId,
        createdAt: memoryTable.createdAt,
        text: sql<string | null>`${memoryTable.content}->>'text'`.as('text'),
        // Use row_number to pick the latest message per room
        rn: sql<number>`row_number() over (partition by ${memoryTable.roomId} order by ${memoryTable.createdAt} desc)`.as('rn'),
      })
      .from(memoryTable)
      .where(eq(memoryTable.type, "messages"))
      .as('latest_messages');

    // Main query: join participants -> rooms -> latest messages
    const results = await db
      .select({
        id: roomTable.id,
        name: roomTable.name,
        characterId: roomTable.agentId,
        createdAt: roomTable.createdAt,
        lastMessageTime: latestMessagesSubquery.createdAt,
        lastMessageText: latestMessagesSubquery.text,
      })
      .from(participantTable)
      .innerJoin(roomTable, eq(participantTable.roomId, roomTable.id))
      .leftJoin(
        latestMessagesSubquery,
        and(
          eq(latestMessagesSubquery.roomId, roomTable.id),
          eq(latestMessagesSubquery.rn, 1)
        )
      )
      .where(eq(participantTable.entityId, entityId));

    // Sort by last message time, falling back to room creation time
    results.sort((a, b) => {
      const timeA = a.lastMessageTime?.getTime() || a.createdAt.getTime();
      const timeB = b.lastMessageTime?.getTime() || b.createdAt.getTime();
      return timeB - timeA;
    });

    return results;
  }
}

export const roomsRepository = new RoomsRepository();
