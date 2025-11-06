"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import {
  generationsService,
  charactersService,
  listContainers,
} from "@/lib/services";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";
import { cache } from "react";

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
  agents: Array<{
    id: string;
    name: string;
    bio: string | string[];
    avatarUrl: string | null;
    category: string | null;
    isPublic: boolean;
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
  const [generationStats, userCharacters, containers] = await Promise.all([
    generationsService.getStats(organizationId),
    charactersService.listByUser(user.id),
    listContainers(organizationId),
  ]);

  const totalGenerations = generationStats.totalGenerations;
  const imageGenerations =
    generationStats.byType.find((t) => t.type === "image")?.count || 0;
  const videoGenerations =
    generationStats.byType.find((t) => t.type === "video")?.count || 0;

  // Use total generations as API calls approximation
  // TODO: Implement proper 24h API call tracking
  const apiCalls24h = generationStats.totalGenerations;

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
    agents: userCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      bio: c.bio,
      avatarUrl: c.avatar_url || null,
      category: c.category || null,
      isPublic: c.is_public,
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
