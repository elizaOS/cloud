/**
 * Repository for ElizaOS Participants table
 * Handles all database operations for participants without spinning up runtime
 */

import { db } from "@/db/client";
import { participantTable } from "@/db/schemas/eliza";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { Participant } from "@elizaos/core";

export interface CreateParticipantInput {
  roomId: string;
  entityId: string;
  agentId: string;
  roomState?: Record<string, unknown>;
}

export class ParticipantsRepository {
  /**
   * Get all participants for a room
   */
  async findByRoomId(roomId: string): Promise<Participant[]> {
    const results = await db
      .select()
      .from(participantTable)
      .where(eq(participantTable.roomId, roomId));

    return results;
  }

  /**
   * Get all rooms for an entity (user)
   * entityId should be the user's database ID (already a UUID)
   */
  async findRoomsByEntityId(entityId: string): Promise<string[]> {
    const results = await db
      .select({ roomId: participantTable.roomId })
      .from(participantTable)
      .where(eq(participantTable.entityId, entityId));

    return results.map((r) => r.roomId);
  }

  /**
   * Get all rooms for multiple entities
   */
  async findRoomsByEntityIds(entityIds: string[]): Promise<Map<string, string[]>> {
    if (entityIds.length === 0) return new Map();

    const results = await db
      .select({
        entityId: participantTable.entityId,
        roomId: participantTable.roomId,
      })
      .from(participantTable)
      .where(inArray(participantTable.entityId, entityIds));

    const map = new Map<string, string[]>();
    for (const result of results) {
      const existing = map.get(result.entityId) || [];
      existing.push(result.roomId);
      map.set(result.entityId, existing);
    }

    return map;
  }

  /**
   * Check if entity is participant in room
   */
  async isParticipant(roomId: string, entityId: string): Promise<boolean> {
    const result = await db
      .select({ id: participantTable.id })
      .from(participantTable)
      .where(
        and(
          eq(participantTable.roomId, roomId),
          eq(participantTable.entityId, entityId),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Add participant to room
   * entityId should be the user's database ID (already a UUID)
   */
  async create(input: CreateParticipantInput): Promise<Participant> {
    // Check if already exists
    const exists = await this.isParticipant(input.roomId, input.entityId);
    if (exists) {
      // Return existing participant
      const existing = await db
        .select()
        .from(participantTable)
        .where(
          and(
            eq(participantTable.roomId, input.roomId),
            eq(participantTable.entityId, input.entityId),
          ),
        )
        .limit(1);
      return existing[0];
    }

    const [participant] = await db
      .insert(participantTable)
      .values({
        roomId: input.roomId,
        entityId: input.entityId,
        agentId: input.agentId,
        roomState: input.roomState,
        createdAt: new Date(),
      })
      .returning();

    return participant;
  }

  /**
   * Remove participant from room
   */
  async delete(roomId: string, entityId: string): Promise<boolean> {
    const result = await db
      .delete(participantTable)
      .where(
        and(
          eq(participantTable.roomId, roomId),
          eq(participantTable.entityId, entityId),
        ),
      )
      .returning({ id: participantTable.id });

    return result.length > 0;
  }

  /**
   * Delete all participants for a room (when deleting room)
   */
  async deleteByRoomId(roomId: string): Promise<number> {
    const result = await db
      .delete(participantTable)
      .where(eq(participantTable.roomId, roomId))
      .returning({ id: participantTable.id });

    return result.length;
  }

  /**
   * Update participant's room state
   */
  async updateRoomState(
    roomId: string,
    entityId: string,
    roomState: Record<string, unknown>,
  ): Promise<Participant> {
    const [participant] = await db
      .update(participantTable)
      .set({ roomState })
      .where(
        and(
          eq(participantTable.roomId, roomId),
          eq(participantTable.entityId, entityId),
        ),
      )
      .returning();

    return participant;
  }

  /**
   * Count participants in a room
   */
  async countByRoomId(roomId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(participantTable)
      .where(eq(participantTable.roomId, roomId));

    return Number(result[0]?.count || 0);
  }

  /**
   * Get all entity IDs for a room
   */
  async getEntityIdsByRoomId(roomId: string): Promise<string[]> {
    const results = await db
      .select({ entityId: participantTable.entityId })
      .from(participantTable)
      .where(eq(participantTable.roomId, roomId));

    return results.map((r) => r.entityId);
  }
}

export const participantsRepository = new ParticipantsRepository();

