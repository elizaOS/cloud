"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import {
  generationsService,
  charactersService,
  listContainers,
  apiKeysService,
} from "@/lib/services";
import { elizaRoomCharactersRepository, usageRecordsRepository } from "@/db/repositories";
import { agentDiscoveryService } from "@/lib/services/agent-discovery";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";
import { cache } from "react";

export interface AgentStats {
  roomCount: number;
  messageCount: number;
  deploymentStatus: "deployed" | "stopped" | "draft";
  lastActiveAt: Date | null;
}

export interface AgentPricingDataPoint {
  date: string;
  [agentId: string]: number | string;
}

export interface AgentPricingData {
  data: AgentPricingDataPoint[];
  agents: Array<{ id: string; name: string }>;
}

export interface DashboardData {
  user: {
    name: string;
  };
  stats: {
    totalGenerations: number;
    apiCalls24h: number;
    imageGenerations: number;
    videoGenerations: number;
  };
  onboarding: {
    hasAgents: boolean;
    hasApiKey: boolean;
    hasChatHistory: boolean;
  };
  agents: Array<{
    id: string;
    name: string;
    bio: string | string[];
    avatarUrl: string | null;
    category: string | null;
    isPublic: boolean;
    stats?: AgentStats;
  }>;
  containers: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    ecs_service_arn: string | null;
    load_balancer_url: string | null;
    port: number;
    desired_count: number;
    cpu: number;
    memory: number;
    last_deployed_at: Date | null;
    created_at: Date;
    error_message: string | null;
  }>;
}

// Internal function to fetch dashboard data (not cached at React level)
async function fetchDashboardDataInternal(
  user: Awaited<ReturnType<typeof requireAuthWithOrg>>,
): Promise<DashboardData> {
  const organizationId = user.organization_id!;

  // Fetch only the data needed for the new dashboard
  const [generationStats, userCharacters, containers, apiKeys, chatRoomCount] = await Promise.all([
    generationsService.getStats(organizationId),
    charactersService.listByUser(user.id),
    listContainers(organizationId),
    apiKeysService.listByOrganization(organizationId),
    elizaRoomCharactersRepository.countByUserId(user.id),
  ]);

  const totalGenerations = generationStats.totalGenerations;
  const imageGenerations =
    generationStats.byType.find((t) => t.type === "image")?.count || 0;
  const videoGenerations =
    generationStats.byType.find((t) => t.type === "video")?.count || 0;

  // Use total generations as API calls approximation
  // TODO: Implement proper 24h API call tracking
  const apiCalls24h = generationStats.totalGenerations;

  // Fetch agent stats in batch
  const characterIds = userCharacters.map((c) => c.id);
  const agentStatsMap = new Map<string, AgentStats>();
  
  if (characterIds.length > 0) {
    try {
      const statsMap = await agentDiscoveryService.getAgentStatisticsBatch(characterIds);
      statsMap.forEach((stats, id) => {
        agentStatsMap.set(id, {
          roomCount: stats.roomCount,
          messageCount: stats.messageCount,
          deploymentStatus: stats.status,
          lastActiveAt: stats.lastActiveAt,
        });
      });
    } catch (error) {
      console.warn("[Dashboard] Failed to fetch agent stats:", error);
    }
  }

  return {
    user: {
      name: user.name || "User",
    },
    stats: {
      totalGenerations,
      apiCalls24h,
      imageGenerations,
      videoGenerations,
    },
    onboarding: {
      hasAgents: userCharacters.length > 0,
      hasApiKey: apiKeys.some(
        (key) => key.name !== "Default API Key" || (key.usage_count ?? 0) > 0
      ),
      hasChatHistory: chatRoomCount > 0,
    },
    agents: userCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      bio: c.bio,
      avatarUrl: c.avatar_url || null,
      category: c.category || null,
      isPublic: c.is_public,
      stats: agentStatsMap.get(c.id),
    })),
    containers: containers.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      ecs_service_arn: c.ecs_service_arn,
      load_balancer_url: c.load_balancer_url,
      port: c.port,
      desired_count: c.desired_count,
      cpu: c.cpu,
      memory: c.memory,
      last_deployed_at: c.last_deployed_at,
      created_at: c.created_at,
      error_message: c.error_message,
    })),
  };
}

// React-cached version for request deduplication
export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const user = await requireAuthWithOrg();
  const organizationId = user.organization_id!;
  const cacheKey = CacheKeys.org.dashboard(organizationId);

  // Use stale-while-revalidate pattern
  const data = await cacheClient.getWithSWR(
    cacheKey,
    CacheStaleTTL.org.dashboard,
    () => fetchDashboardDataInternal(user),
  );

  // Fallback to direct fetch if cache returns null
  if (data === null) {
    return await fetchDashboardDataInternal(user);
  }

  return data;
});

/**
 * Get agent pricing data for the dashboard chart
 * This shows daily costs broken down by agent over the past 90 days
 * Uses character_id from usage record metadata to properly attribute costs to agents
 * Only includes agents with non-zero usage
 */
export async function getAgentPricingData(): Promise<AgentPricingData> {
  const user = await requireAuthWithOrg();
  const organizationId = user.organization_id!;

  // Get the date range (last 90 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  // Fetch user's characters (agents)
  const userCharacters = await charactersService.listByUser(user.id);

  if (userCharacters.length === 0) {
    return { data: [], agents: [] };
  }

  // Get daily costs grouped by character_id from metadata
  const dailyCostsByCharacter = await usageRecordsRepository.getDailyCostsByCharacter(
    organizationId,
    startDate,
    endDate,
  );

  // Build agent list from user's characters
  const agentList = userCharacters.map((char) => ({
    id: char.id,
    name: char.name,
  }));

  // Create a Set of valid agent IDs for quick lookup
  const validAgentIds = new Set(agentList.map((a) => a.id));

  // Track total cost per agent to filter out zero-usage agents
  const agentTotalCosts = new Map<string, number>();
  agentList.forEach((agent) => agentTotalCosts.set(agent.id, 0));
  agentTotalCosts.set("_other", 0);

  // Group costs by date
  const dateMap = new Map<string, AgentPricingDataPoint>();

  // Process each cost entry
  for (const cost of dailyCostsByCharacter) {
    const dateKey = cost.date;
    
    // Initialize the date entry if not exists
    if (!dateMap.has(dateKey)) {
      const point: AgentPricingDataPoint = { date: dateKey };
      // Initialize all agents with 0 cost
      agentList.forEach((agent) => {
        point[agent.id] = 0;
      });
      // Add "Other" for unattributed costs
      point["_other"] = 0;
      dateMap.set(dateKey, point);
    }

    const point = dateMap.get(dateKey)!;
    
    // Attribute cost to the correct agent or "Other"
    if (cost.characterId && validAgentIds.has(cost.characterId)) {
      point[cost.characterId] = (point[cost.characterId] as number) + cost.cost;
      agentTotalCosts.set(
        cost.characterId,
        (agentTotalCosts.get(cost.characterId) || 0) + cost.cost
      );
    } else {
      // Unattributed costs (no character_id or character not owned by user)
      point["_other"] = (point["_other"] as number) + cost.cost;
      agentTotalCosts.set("_other", (agentTotalCosts.get("_other") || 0) + cost.cost);
    }
  }

  // Filter out agents with zero total cost
  const activeAgents = agentList.filter((agent) => {
    const totalCost = agentTotalCosts.get(agent.id) || 0;
    return totalCost > 0;
  });

  // Check if we have any "Other" costs to show
  const hasOtherCosts = (agentTotalCosts.get("_other") || 0) > 0;
  
  // Final agent list - only include agents with usage
  const finalAgentList = hasOtherCosts
    ? [...activeAgents, { id: "_other", name: "Other / Unattributed" }]
    : activeAgents;

  // Convert map to sorted array
  const data = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return {
    data,
    agents: finalAgentList,
  };
}
