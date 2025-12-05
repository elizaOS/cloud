"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import {
  generationsService,
  charactersService,
  listContainers,
  apiKeysService,
} from "@/lib/services";
import { elizaRoomCharactersRepository } from "@/db/repositories";
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
