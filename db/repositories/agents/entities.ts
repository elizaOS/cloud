/**
 * Repository for ElizaOS Entities table
 * Handles all database operations for entities without spinning up runtime
 */

import { db } from "@/db/client";
import { entityTable } from "@/db/schemas/eliza";
import { eq, inArray, sql } from "drizzle-orm";
import type { Entity, UUID } from "@elizaos/core";

export interface CreateEntityInput {
  id: string;
  agentId: string;
  names: string[];
  metadata?: Record<string, unknown>;
}

export class EntitiesRepository {
  /**
   * Get entity by ID
   * entityId should be the user's database ID (already a UUID)
   */
  async findById(entityId: string): Promise<Entity | null> {
    const result = await db
      .select()
      .from(entityTable)
      .where(eq(entityTable.id, entityId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get multiple entities by IDs
   */
  async findByIds(entityIds: string[]): Promise<Entity[]> {
    if (entityIds.length === 0) return [];

    const results = await db
      .select()
      .from(entityTable)
      .where(inArray(entityTable.id, entityIds));

    return results;
  }

  /**
   * Get entities by agent ID
   */
  async findByAgentId(agentId: string, limit = 100): Promise<Entity[]> {
    const results = await db
      .select()
      .from(entityTable)
      .where(eq(entityTable.agentId, agentId))
      .limit(limit);

    return results;
  }

  /**
   * Check if entity exists
   */
  async exists(entityId: string): Promise<boolean> {
    const result = await db
      .select({ id: entityTable.id })
      .from(entityTable)
      .where(eq(entityTable.id, entityId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Create a new entity
   * Both entityId and agentId should be UUIDs from our database
   */
  async create(input: CreateEntityInput): Promise<Entity> {
    // Check if already exists
    const existing = await this.findById(input.id);
    if (existing) {
      return existing;
    }

    const [entity] = await db
      .insert(entityTable)
      .values({
        id: input.id,
        agentId: input.agentId,
        names: input.names,
        metadata: input.metadata,
        createdAt: new Date(),
      })
      .returning();

    return entity;
  }

  /**
   * Update entity names
   */
  async updateNames(entityId: string, names: string[]): Promise<Entity> {
    const [entity] = await db
      .update(entityTable)
      .set({ names })
      .where(eq(entityTable.id, entityId))
      .returning();

    return entity;
  }

  /**
   * Update entity metadata
   */
  async updateMetadata(
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<Entity> {
    const [entity] = await db
      .update(entityTable)
      .set({ metadata })
      .where(eq(entityTable.id, entityId))
      .returning();

    return entity;
  }

  /**
   * Delete entity
   */
  async delete(entityId: string): Promise<boolean> {
    const result = await db
      .delete(entityTable)
      .where(eq(entityTable.id, entityId))
      .returning({ id: entityTable.id });

    return result.length > 0;
  }

  /**
   * Count entities by agent
   */
  async countByAgentId(agentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(entityTable)
      .where(eq(entityTable.agentId, agentId));

    return Number(result[0]?.count || 0);
  }

  /**
   * Find entity by name (useful for lookups)
   */
  async findByName(agentId: string, name: string): Promise<Entity | null> {
    const result = await db.execute<{
      id: string;
      agent_id: string;
      names: string[];
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }>(sql`
      SELECT *
      FROM ${entityTable}
      WHERE agent_id = ${agentId}::uuid
        AND ${name} = ANY(names)
      LIMIT 1
    `);

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    return {
      id: row.id as UUID,
      agentId: row.agent_id as UUID,
      names: row.names,
      metadata: row.metadata || undefined,
      createdAt: row.created_at.getTime(),
    } as Entity;
  }

  /**
   * Search entities by name pattern
   */
  async searchByName(
    agentId: string,
    namePattern: string,
    limit = 10,
  ): Promise<Entity[]> {
    const result = await db.execute<{
      id: string;
      agent_id: string;
      names: string[];
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }>(sql`
      SELECT *
      FROM ${entityTable}
      WHERE agent_id = ${agentId}::uuid
        AND EXISTS (
          SELECT 1 FROM unnest(names) AS name
          WHERE name ILIKE ${`%${namePattern}%`}
        )
      LIMIT ${limit}
    `);

    return result.rows.map(
      (row) =>
        ({
          id: row.id as UUID,
          agentId: row.agent_id as UUID,
          names: row.names,
          metadata: row.metadata || undefined,
          createdAt: row.created_at.getTime(),
        }) as Entity,
    );
  }
}

export const entitiesRepository = new EntitiesRepository();
