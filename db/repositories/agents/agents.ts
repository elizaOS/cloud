/**
 * Agents Repository
 * Pure database operations for the ElizaOS agents table
 * Used to get agent info without spinning up the full runtime
 */

import { db } from "@/db/client";
import { agentTable } from "@/db/schemas/eliza";
import { eq, inArray } from "drizzle-orm";
import type { Agent } from "@elizaos/core";

/**
 * Agent info returned from database
 * Matches the agentTable schema from @elizaos/plugin-sql
 */
export interface AgentInfo {
  id: string;
  name: string;
  username?: string | null;
  bio?: string | string[] | null;
  system?: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  settings?: Record<string, unknown> | null;
}

export class AgentsRepository {
  /**
   * Get agent by ID
   */
  async findById(agentId: string): Promise<AgentInfo | null> {
    const result = await db
      .select({
        id: agentTable.id,
        name: agentTable.name,
        username: agentTable.username,
        bio: agentTable.bio,
        system: agentTable.system,
        enabled: agentTable.enabled,
        createdAt: agentTable.createdAt,
        updatedAt: agentTable.updatedAt,
        settings: agentTable.settings,
      })
      .from(agentTable)
      .where(eq(agentTable.id, agentId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get multiple agents by IDs
   */
  async findByIds(agentIds: string[]): Promise<AgentInfo[]> {
    if (agentIds.length === 0) return [];

    return await db
      .select({
        id: agentTable.id,
        name: agentTable.name,
        username: agentTable.username,
        bio: agentTable.bio,
        system: agentTable.system,
        enabled: agentTable.enabled,
        createdAt: agentTable.createdAt,
        updatedAt: agentTable.updatedAt,
        settings: agentTable.settings,
      })
      .from(agentTable)
      .where(inArray(agentTable.id, agentIds));
  }

  /**
   * Check if agent exists
   */
  async exists(agentId: string): Promise<boolean> {
    const result = await db
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(eq(agentTable.id, agentId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Create a new agent
   * Returns true if successful, false if agent with same ID already exists
   */
  async create(agent: Partial<Agent>): Promise<boolean> {
    try {
      // Check for existing agent with the same ID only (names can be duplicated)
      if (agent.id) {
        const existing = await db
          .select({ id: agentTable.id })
          .from(agentTable)
          .where(eq(agentTable.id, agent.id))
          .limit(1);

        if (existing.length > 0) {
          console.warn(
            `Attempted to create an agent with a duplicate ID. ID: ${agent.id}`,
          );
          return false;
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(agentTable).values({
          ...agent,
          createdAt: new Date(agent.createdAt || Date.now()),
          updatedAt: new Date(agent.updatedAt || Date.now()),
        });
      });

      console.debug(`Agent created successfully: ${agent.id}`);
      return true;
    } catch (error) {
      console.error(
        `Error creating agent: ${error instanceof Error ? error.message : String(error)}, agentId: ${agent.id}`,
      );
      return false;
    }
  }

  /**
   * Get agent's avatar URL from settings
   */
  async getAvatarUrl(agentId: string): Promise<string | undefined> {
    const agent = await this.findById(agentId);
    return agent?.settings?.avatarUrl as string | undefined;
  }

  /**
   * Get basic agent display info (name, avatar)
   */
  async getDisplayInfo(agentId: string): Promise<{
    id: string;
    name: string;
    avatarUrl?: string;
  } | null> {
    const agent = await this.findById(agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      name: agent.name,
      avatarUrl: agent.settings?.avatarUrl as string | undefined,
    };
  }
}

// Export singleton instance
export const agentsRepository = new AgentsRepository();
