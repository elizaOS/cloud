import { charactersService } from "./characters";
import { containersService } from "./containers";
import {
  agentStateCache,
  type AgentStats,
} from "@/lib/cache/agent-state-cache";
import { logger } from "@/lib/utils/logger";
import { createHash } from "node:crypto";
import type { UserCharacter } from "@/db/repositories";
import { db } from "@/db/client";
import { elizaRoomCharactersRepository } from "@/db/repositories/eliza-room-characters";

// Re-export AgentStats for convenience
export type { AgentStats };

export interface AgentDiscoveryFilters {
  deployed?: boolean;
  template?: boolean;
  owned?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  bio: string[];
  plugins: string[];
  status: "deployed" | "draft" | "stopped";
  avatarUrl?: string;
  messageCount?: number;
  lastActiveAt?: Date | null;
  deploymentUrl?: string;
  isTemplate?: boolean;
  ownerId?: string;
}

export interface AgentListResult {
  agents: AgentInfo[];
  total: number;
  cached: boolean;
}

export class AgentDiscoveryService {
  /**
   * List all available agents with optional filters
   * @param organizationId - Organization ID
   * @param userId - User ID (for owned filter)
   * @param filters - Optional filters
   * @param includeStats - Include usage statistics
   * @returns List of agents
   */
  async listAgents(
    organizationId: string,
    userId: string,
    filters?: AgentDiscoveryFilters,
    includeStats: boolean = false,
  ): Promise<AgentListResult> {
    try {
      // Create filter hash for caching
      const filterHash = this.hashFilters(filters || {});

      // Check cache first
      const cached = await agentStateCache.getAgentList(
        organizationId,
        filterHash,
      );
      if (cached) {
        logger.debug(
          `[Agent Discovery] Cache hit for org ${organizationId} with filters ${filterHash}`,
        );
        return {
          agents: cached as AgentInfo[],
          total: cached.length,
          cached: true,
        };
      }

      logger.debug(
        `[Agent Discovery] Cache miss, fetching agents for org ${organizationId}`,
      );

      // Fetch characters and containers in parallel
      const [characters, containers] = await Promise.all([
        this.fetchCharacters(organizationId, userId, filters),
        this.fetchContainers(organizationId),
      ]);

      // Build agent info from characters
      const agents = await Promise.all(
        characters.map((char) =>
          this.buildAgentInfo(char, containers, includeStats),
        ),
      );

      // Filter by deployment status if requested
      let filteredAgents = agents;
      if (filters?.deployed !== undefined) {
        filteredAgents = agents.filter((a) =>
          filters.deployed ? a.status === "deployed" : a.status !== "deployed",
        );
      }

      // Cache the result
      await agentStateCache.setAgentList(
        organizationId,
        filterHash,
        filteredAgents,
      );

      return {
        agents: filteredAgents,
        total: filteredAgents.length,
        cached: false,
      };
    } catch (error) {
      logger.error("[Agent Discovery] Error listing agents:", error);
      throw error;
    }
  }

  /**
   * Fetch characters based on filters
   */
  private async fetchCharacters(
    organizationId: string,
    userId: string,
    filters?: AgentDiscoveryFilters,
  ): Promise<UserCharacter[]> {
    if (filters?.template) {
      // Fetch templates
      const templates = await charactersService.listTemplates();
      return templates;
    }

    if (filters?.owned) {
      // Fetch user's own characters
      return await charactersService.listByUser(userId);
    }

    // Fetch all organization characters (including templates)
    const [orgChars, templates] = await Promise.all([
      charactersService.listByOrganization(organizationId),
      charactersService.listTemplates(),
    ]);

    return [...orgChars, ...templates];
  }

  /**
   * Fetch active containers for deployment status
   */
  private async fetchContainers(organizationId: string) {
    try {
      return await containersService.listByOrganization(organizationId);
    } catch (error) {
      logger.warn(
        `[Agent Discovery] Error fetching containers: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return [];
    }
  }

  /**
   * Build AgentInfo from character and deployment data
   */
  private async buildAgentInfo(
    character: UserCharacter,
    containers: Awaited<
      ReturnType<typeof containersService.listByOrganization>
    >,
    includeStats: boolean,
  ): Promise<AgentInfo> {
    // Find deployment container by character_id FK
    const container = containers.find(
      (c) => c.character_id === character.id && c.status === "running",
    );

    // Determine status
    let status: "deployed" | "draft" | "stopped" = "draft";
    if (container) {
      status = "deployed";
    } else {
      // Check if there's a stopped container
      const stoppedContainer = containers.find(
        (c) => c.character_id === character.id && c.status !== "running",
      );
      if (stoppedContainer) {
        status = "stopped";
      }
    }

    // Build base agent info
    const agentInfo: AgentInfo = {
      id: character.id,
      name: character.name,
      bio: Array.isArray(character.bio) ? character.bio : [character.bio || ""],
      plugins: character.plugins || [],
      status,
      isTemplate: character.is_template || false,
      ownerId: character.user_id,
      ...(container?.load_balancer_url && {
        deploymentUrl: container.load_balancer_url,
      }),
    };

    // Fetch statistics if requested
    if (includeStats) {
      const stats = await this.getAgentStatistics(character.id);
      agentInfo.messageCount = stats.messageCount;
      agentInfo.lastActiveAt = stats.lastActiveAt;
    }

    return agentInfo;
  }

  /**
   * Get agent statistics (message count, room count, last active, etc.)
   * @param agentId - Agent/character ID
   * @returns Agent statistics
   */
  async getAgentStatistics(agentId: string): Promise<AgentStats> {
    try {
      // Check cache first
      const cached = await agentStateCache.getAgentStats(agentId);
      if (cached) {
        return cached;
      }

      // Get room count from our database (this always works)
      let roomCount = 0;
      try {
        roomCount =
          await elizaRoomCharactersRepository.countByCharacterId(agentId);
        logger.debug(
          `[Agent Discovery] Room count for ${agentId}: ${roomCount}`
        );
      } catch (error) {
        logger.warn(
          `[Agent Discovery] Error fetching room count for ${agentId}:`,
          error
        );
      }

      // Check if character is deployed by looking for a container
      const container = await containersService.getByCharacterId(agentId);

      // Determine deployment status
      let status: "deployed" | "stopped" | "draft" = "draft";
      let uptime = 0;

      if (container) {
        status = container.status === "running" ? "deployed" : "stopped";
        if (container.last_deployed_at && status === "deployed") {
          uptime =
            Date.now() - new Date(container.last_deployed_at).getTime();
        }
      }

      // For message count, use room count as a proxy (each room has messages)
      // This is more reliable than trying to query ElizaOS runtime
      const messageCount = roomCount; // Each room represents at least one conversation

      // Last active is approximated from the most recent room creation
      let lastActiveAt: Date | null = null;
      // We could query the most recent room's created_at but for simplicity
      // we'll leave this null for now if we don't have deployment data

      const stats: AgentStats = {
        agentId,
        messageCount,
        roomCount,
        lastActiveAt,
        uptime,
        status,
      };

      // Cache the stats (5 minute TTL)
      await agentStateCache.setAgentStats(agentId, stats);

      return stats;
    } catch (error) {
      logger.debug(
        `[Agent Discovery] Could not fetch stats for ${agentId}:`,
        error
      );

      // Return and cache empty stats
      const emptyStats: AgentStats = {
        agentId,
        messageCount: 0,
        roomCount: 0,
        lastActiveAt: null,
        uptime: 0,
        status: "draft",
      };

      // Cache to avoid repeated failed lookups
      await agentStateCache.setAgentStats(agentId, emptyStats);

      return emptyStats;
    }
  }

  /**
   * Get agent statistics for multiple agents in a single batch operation
   * @param agentIds - Array of agent/character IDs
   * @returns Map of agent ID to stats
   */
  async getAgentStatisticsBatch(
    agentIds: string[]
  ): Promise<Map<string, AgentStats>> {
    const statsMap = new Map<string, AgentStats>();

    if (agentIds.length === 0) {
      return statsMap;
    }

    // First, try to get all from cache
    const uncachedIds: string[] = [];
    for (const agentId of agentIds) {
      const cached = await agentStateCache.getAgentStats(agentId);
      if (cached) {
        statsMap.set(agentId, cached);
      } else {
        uncachedIds.push(agentId);
      }
    }

    // If all were cached, return early
    if (uncachedIds.length === 0) {
      return statsMap;
    }

    try {
      // Batch fetch room counts and containers
      const [roomCounts, containers] = await Promise.all([
        elizaRoomCharactersRepository.countByCharacterIds(uncachedIds),
        containersService.listByCharacterIds(uncachedIds),
      ]);

      logger.debug(
        `[Agent Discovery] Batch room counts: ${JSON.stringify(Object.fromEntries(roomCounts))}`
      );

      const containerMap = new Map(
        containers.map((c) => [c.character_id!, c])
      );

      // Process each uncached agent
      for (const agentId of uncachedIds) {
        const container = containerMap.get(agentId);
        const roomCount = roomCounts.get(agentId) ?? 0;

        // Determine deployment status
        let status: "deployed" | "stopped" | "draft" = "draft";
        let uptime = 0;

        if (container) {
          status = container.status === "running" ? "deployed" : "stopped";
          if (container.last_deployed_at && status === "deployed") {
            uptime =
              Date.now() - new Date(container.last_deployed_at).getTime();
          }
        }

        const stats: AgentStats = {
          agentId,
          messageCount: roomCount, // Use room count as message proxy
          roomCount,
          lastActiveAt: null,
          uptime,
          status,
        };

        await agentStateCache.setAgentStats(agentId, stats);
        statsMap.set(agentId, stats);
      }
    } catch (error) {
      logger.warn(`[Agent Discovery] Error in batch stats fetch:`, error);
      // Return empty stats for remaining agents
      for (const agentId of uncachedIds) {
        if (!statsMap.has(agentId)) {
          const emptyStats: AgentStats = {
            agentId,
            messageCount: 0,
            roomCount: 0,
            lastActiveAt: null,
            uptime: 0,
            status: "draft",
          };
          statsMap.set(agentId, emptyStats);
        }
      }
    }

    return statsMap;
  }

  /**
   * Invalidate agent list cache for organization
   * Call this when characters or containers are created/updated/deleted
   */
  async invalidateAgentListCache(organizationId: string): Promise<void> {
    await agentStateCache.invalidateAgentList(organizationId);
    logger.debug(
      `[Agent Discovery] Invalidated agent list cache for org ${organizationId}`,
    );
  }

  /**
   * Create a deterministic hash of filters for caching
   */
  private hashFilters(filters: AgentDiscoveryFilters): string {
    const filterStr = JSON.stringify({
      deployed: filters.deployed ?? null,
      template: filters.template ?? null,
      owned: filters.owned ?? null,
    });
    return createHash("md5").update(filterStr).digest("hex").substring(0, 8);
  }
}

// Export singleton instance
export const agentDiscoveryService = new AgentDiscoveryService();
