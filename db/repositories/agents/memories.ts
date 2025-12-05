/**
 * Repository for ElizaOS Memories table (non-message memories)
 * Handles all database operations for memories without spinning up runtime
 */

import { db } from "@/db/client";
import { memoryTable } from "@/db/schemas/eliza";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { Memory } from "@elizaos/core";

export interface CreateMemoryInput {
  id: string;
  roomId: string;
  entityId: string;
  agentId: string;
  type: string;
  content: Record<string, unknown>;
  unique?: boolean;
  worldId?: string;
}

export interface SearchMemoriesOptions {
  roomId?: string;
  agentId: string;
  type?: string;
  types?: string[];
  limit?: number;
  offset?: number;
}

export class MemoriesRepository {
  /**
   * Get messages for a room (type='messages')
   */
  async findMessages(
    roomId: string,
    options: {
      agentId?: string;
      limit?: number;
      offset?: number;
      afterTimestamp?: number;
      beforeTimestamp?: number;
    } = {},
  ): Promise<Memory[]> {
    const { agentId, limit = 50, offset = 0, afterTimestamp, beforeTimestamp } = options;

    const conditions = [
      eq(memoryTable.roomId, roomId),
      eq(memoryTable.type, "messages"),
    ];

    if (agentId) {
      conditions.push(eq(memoryTable.agentId, agentId));
    }
    if (afterTimestamp) {
      conditions.push(sql`${memoryTable.createdAt} > ${new Date(afterTimestamp)}`);
    }
    if (beforeTimestamp) {
      conditions.push(sql`${memoryTable.createdAt} < ${new Date(beforeTimestamp)}`);
    }

    const results = await db
      .select()
      .from(memoryTable)
      .where(and(...conditions))
      .orderBy(desc(memoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Get messages for multiple rooms
   */
  async findMessagesByRoomIds(
    roomIds: string[],
    agentId?: string,
    limit = 50,
  ): Promise<Memory[]> {
    if (roomIds.length === 0) return [];

    const conditions = [
      inArray(memoryTable.roomId, roomIds),
      eq(memoryTable.type, "messages"),
    ];

    if (agentId) {
      conditions.push(eq(memoryTable.agentId, agentId));
    }

    const results = await db
      .select()
      .from(memoryTable)
      .where(and(...conditions))
      .orderBy(desc(memoryTable.createdAt))
      .limit(limit);

    return results;
  }

  /**
   * Count messages in a room
   */
  async countMessages(roomId: string, agentId?: string): Promise<number> {
    const conditions = [
      eq(memoryTable.roomId, roomId),
      eq(memoryTable.type, "messages"),
    ];

    if (agentId) {
      conditions.push(eq(memoryTable.agentId, agentId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoryTable)
      .where(and(...conditions));

    return Number(result[0]?.count || 0);
  }

  /**
   * Count messages by agent across all rooms
   */
  async countMessagesByAgent(agentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.agentId, agentId),
          eq(memoryTable.type, "messages"),
        ),
      );

    return Number(result[0]?.count || 0);
  }

  /**
   * Get last message timestamp for an agent
   */
  async getLastMessageTime(agentId: string): Promise<Date | null> {
    const result = await db
      .select({ createdAt: memoryTable.createdAt })
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.agentId, agentId),
          eq(memoryTable.type, "messages"),
        ),
      )
      .orderBy(desc(memoryTable.createdAt))
      .limit(1);

    return result[0]?.createdAt || null;
  }

  /**
   * Delete messages in a room
   */
  async deleteMessages(roomId: string): Promise<number> {
    const result = await db
      .delete(memoryTable)
      .where(
        and(
          eq(memoryTable.roomId, roomId),
          eq(memoryTable.type, "messages"),
        ),
      )
      .returning({ id: memoryTable.id });

    return result.length;
  }

  /**
   * Get memories for a room (excluding messages)
   */
  async findByRoomId(
    roomId: string,
    agentId: string,
    limit = 50,
    offset = 0,
  ): Promise<Memory[]> {
    const results = await db
      .select()
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.roomId, roomId),
          eq(memoryTable.agentId, agentId),
          sql`${memoryTable.type} != 'messages'`, // Exclude messages
        ),
      )
      .orderBy(desc(memoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Get memories by agent (across all rooms)
   */
  async findByAgentId(
    agentId: string,
    limit = 50,
    offset = 0,
  ): Promise<Memory[]> {
    const results = await db
      .select()
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.agentId, agentId),
          sql`${memoryTable.type} != 'messages'`, // Exclude messages
        ),
      )
      .orderBy(desc(memoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Get memory by ID
   */
  async findById(memoryId: string): Promise<Memory | null> {
    const result = await db
      .select()
      .from(memoryTable)
      .where(eq(memoryTable.id, memoryId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Search memories with filters
   */
  async search(options: SearchMemoriesOptions): Promise<Memory[]> {
    const { roomId, agentId, type, types, limit = 50, offset = 0 } = options;

    const conditions = [
      eq(memoryTable.agentId, agentId),
      sql`${memoryTable.type} != 'messages'`, // Exclude messages
    ];

    if (roomId) {
      conditions.push(eq(memoryTable.roomId, roomId));
    }

    if (type) {
      conditions.push(eq(memoryTable.type, type));
    } else if (types && types.length > 0) {
      conditions.push(inArray(memoryTable.type, types));
    }

    const results = await db
      .select()
      .from(memoryTable)
      .where(and(...conditions))
      .orderBy(desc(memoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Create a new memory
   */
  async create(input: CreateMemoryInput): Promise<Memory> {
    const [memory] = await db
      .insert(memoryTable)
      .values({
        id: input.id,
        roomId: input.roomId,
        entityId: input.entityId,
        agentId: input.agentId,
        type: input.type,
        content: input.content,
        unique: input.unique ?? false,
        worldId: input.worldId,
        createdAt: new Date(),
      })
      .returning();

    return memory;
  }

  /**
   * Delete a memory
   */
  async delete(memoryId: string): Promise<boolean> {
    const result = await db
      .delete(memoryTable)
      .where(eq(memoryTable.id, memoryId))
      .returning({ id: memoryTable.id });

    return result.length > 0;
  }

  /**
   * Delete memories by room (when deleting room)
   */
  async deleteByRoomId(roomId: string): Promise<number> {
    const result = await db
      .delete(memoryTable)
      .where(
        and(
          eq(memoryTable.roomId, roomId),
          sql`${memoryTable.type} != 'messages'`, // Only delete non-message memories
        ),
      )
      .returning({ id: memoryTable.id });

    return result.length;
  }

  /**
   * Delete memories by agent
   */
  async deleteByAgentId(agentId: string): Promise<number> {
    const result = await db
      .delete(memoryTable)
      .where(
        and(
          eq(memoryTable.agentId, agentId),
          sql`${memoryTable.type} != 'messages'`,
        ),
      )
      .returning({ id: memoryTable.id });

    return result.length;
  }

  /**
   * Count memories
   */
  async countByRoomId(roomId: string, agentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.roomId, roomId),
          eq(memoryTable.agentId, agentId),
          sql`${memoryTable.type} != 'messages'`,
        ),
      );

    return Number(result[0]?.count || 0);
  }

  /**
   * Count memories by type
   */
  async countByType(
    agentId: string,
    type: string,
    roomId?: string,
  ): Promise<number> {
    const conditions = [
      eq(memoryTable.agentId, agentId),
      eq(memoryTable.type, type),
    ];

    if (roomId) {
      conditions.push(eq(memoryTable.roomId, roomId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoryTable)
      .where(and(...conditions));

    return Number(result[0]?.count || 0);
  }

  /**
   * Get memory types for an agent
   */
  async getTypes(agentId: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ type: memoryTable.type })
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.agentId, agentId),
          sql`${memoryTable.type} != 'messages'`,
        ),
      );

    return result.map((r) => r.type).filter((t): t is string => t !== null);
  }

  /**
   * Delete old memories (retention policy)
   */
  async deleteOlderThan(
    agentId: string,
    days: number,
    types?: string[],
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const conditions = [
      eq(memoryTable.agentId, agentId),
      sql`${memoryTable.createdAt} < ${cutoffDate}`,
      sql`${memoryTable.type} != 'messages'`,
    ];

    if (types && types.length > 0) {
      conditions.push(inArray(memoryTable.type, types));
    }

    const result = await db
      .delete(memoryTable)
      .where(and(...conditions))
      .returning({ id: memoryTable.id });

    return result.length;
  }

  /**
   * Get the last message for a single room
   * Returns raw Memory object
   */
  async findLastMessageForRoom(roomId: string): Promise<Memory | null> {
    const result = await db
      .select()
      .from(memoryTable)
      .where(
        and(
          eq(memoryTable.roomId, roomId),
          eq(memoryTable.type, "messages"),
        ),
      )
      .orderBy(desc(memoryTable.createdAt))
      .limit(1);

    return result[0] || null;
  }
}

export const memoriesRepository = new MemoriesRepository();
