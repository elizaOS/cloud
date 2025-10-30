import { charactersService } from "./characters";
import { containersService } from "./containers";
import {
  agentStateCache,
  type AgentStats,
} from "@/lib/cache/agent-state-cache";
import { logger } from "@/lib/utils/logger";
import { createHash } from "node:crypto";
import type { UserCharacter } from "@/db/repositories";
import type { Memory } from "@elizaos/core";
import { db } from "@/db/client";

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
    includeStats: boolean = false
  ): Promise<AgentListResult> {
    try {
      // Create filter hash for caching
      const filterHash = this.hashFilters(filters || {});

      // Check cache first
      const cached = await agentStateCache.getAgentList(
        organizationId,
        filterHash
      );
      if (cached) {
        logger.debug(
          `[Agent Discovery] Cache hit for org ${organizationId} with filters ${filterHash}`
        );
        return {
          agents: cached as AgentInfo[],
          total: cached.length,
          cached: true,
        };
      }

      logger.debug(
        `[Agent Discovery] Cache miss, fetching agents for org ${organizationId}`
      );

      // Fetch characters and containers in parallel
      const [characters, containers] = await Promise.all([
        this.fetchCharacters(organizationId, userId, filters),
        this.fetchContainers(organizationId),
      ]);

      // Build agent info from characters
      const agents = await Promise.all(
        characters.map((char) =>
          this.buildAgentInfo(char, containers, includeStats)
        )
      );

      // Filter by deployment status if requested
      let filteredAgents = agents;
      if (filters?.deployed !== undefined) {
        filteredAgents = agents.filter((a) =>
          filters.deployed ? a.status === "deployed" : a.status !== "deployed"
        );
      }

      // Cache the result
      await agentStateCache.setAgentList(
        organizationId,
        filterHash,
        filteredAgents
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
    filters?: AgentDiscoveryFilters
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
        `[Agent Discovery] Error fetching containers: ${error instanceof Error ? error.message : "Unknown error"}`
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
    includeStats: boolean
  ): Promise<AgentInfo> {
    // Find deployment container by character_id FK
    const container = containers.find(
      (c) => c.character_id === character.id && c.status === "running"
    );

    // Determine status
    let status: "deployed" | "draft" | "stopped" = "draft";
    if (container) {
      status = "deployed";
    } else {
      // Check if there's a stopped container
      const stoppedContainer = containers.find(
        (c) => c.character_id === character.id && c.status !== "running"
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
   * Get agent statistics (message count, last active, etc.)
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

      // Check if character is deployed by looking for a container
      const container = await containersService.getByCharacterId(agentId);

      // If no container exists, character is not deployed - return empty stats
      if (!container) {
        const emptyStats: AgentStats = {
          agentId,
          messageCount: 0,
          lastActiveAt: null,
          uptime: 0,
          status: "draft",
        };
        await agentStateCache.setAgentStats(agentId, emptyStats);
        return emptyStats;
      }

      // Character is deployed - fetch statistics from ElizaOS database
      const { agentRuntime } = await import("@/lib/eliza/agent-runtime");
      const runtime = await agentRuntime.getRuntime();
      const adapter = runtime.adapter as unknown as {
        getMemoriesByRoomIds: (params: {
          tableName: string;
          agentId?: string;
          count?: boolean;
        }) => Promise<Memory[] | number>;
        getRoomsByIds: (
          roomIds: string[]
        ) => Promise<{ id: string; createdAt?: Date }[]>;
      };

      // Get message count for this agent across all rooms
      // Note: ElizaOS adapter might need filtering by agentId
      let messageCount = 0;
      try {
        const result = await adapter.getMemoriesByRoomIds({
          tableName: "messages",
          agentId,
          count: true,
        });

        if (result === null || result === undefined) {
          messageCount = 0;
        } else if (typeof result === "number") {
          messageCount = result;
        } else if (Array.isArray(result)) {
          messageCount = result.length;
        } else {
          messageCount = 0;
        }
      } catch (error) {
        logger.warn(
          `[Agent Discovery] Error fetching message count for ${agentId}:`,
          error
        );
        messageCount = 0;
      }

      // Determine last active time from most recent message
      let lastActiveAt: Date | null = null;
      try {
        const recentMessages = (await adapter.getMemoriesByRoomIds({
          tableName: "messages",
          agentId,
          count: false,
        })) as Memory[];

        if (
          recentMessages &&
          Array.isArray(recentMessages) &&
          recentMessages.length > 0
        ) {
          const sortedMessages = recentMessages.sort(
            (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
          );
          if (sortedMessages[0]?.createdAt) {
            lastActiveAt = new Date(sortedMessages[0].createdAt);
          }
        }
      } catch (error) {
        logger.warn(
          `[Agent Discovery] Error fetching last active time for ${agentId}:`,
          error
        );
      }

      // Calculate uptime (time since last deployment)
      let uptime = 0;
      try {
        const containers = await containersService.listByOrganization(agentId);
        const activeContainer = containers.find(
          (c) => c.character_id === agentId && c.status === "running"
        );

        if (activeContainer?.last_deployed_at) {
          uptime =
            Date.now() - new Date(activeContainer.last_deployed_at).getTime();
        }
      } catch (error) {
        logger.warn(
          `[Agent Discovery] Unable to calculate uptime for ${agentId}:`,
          error
        );
      }

      const stats: AgentStats = {
        agentId,
        messageCount,
        lastActiveAt,
        uptime,
        status: uptime > 0 ? "deployed" : "draft",
      };

      // Cache the stats (5 minute TTL)
      await agentStateCache.setAgentStats(agentId, stats);

      return stats;
    } catch (error) {
      logger.debug(
        `[Agent Discovery] Could not fetch stats for ${agentId} (likely not deployed)`
      );

      // Return and cache empty stats for non-deployed characters
      const emptyStats: AgentStats = {
        agentId,
        messageCount: 0,
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
      // Get containers for all uncached agents in one query
      const containers =
        await containersService.listByCharacterIds(uncachedIds);
      const containerMap = new Map(containers.map((c) => [c.character_id!, c]));

      // Process each uncached agent
      for (const agentId of uncachedIds) {
        const container = containerMap.get(agentId);

        // If no container, return empty stats
        if (!container) {
          const emptyStats: AgentStats = {
            agentId,
            messageCount: 0,
            lastActiveAt: null,
            uptime: 0,
            status: "draft",
          };
          await agentStateCache.setAgentStats(agentId, emptyStats);
          statsMap.set(agentId, emptyStats);
          continue;
        }

        // For deployed agents, we still need individual stats (ElizaOS limitation)
        // But at least we batched the container lookups
        const stats = await this.getAgentStatistics(agentId);
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
      `[Agent Discovery] Invalidated agent list cache for org ${organizationId}`
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
