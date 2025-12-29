/**
 * Dashboard API endpoint.
 *
 * Provides dashboard data for mobile apps and client-side fetching.
 * GET /api/v1/dashboard
 */

import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { charactersService } from "@/lib/services/characters";
import { listContainers } from "@/lib/services/containers";
import { apiKeysService } from "@/lib/services/api-keys";
import { characterDeploymentDiscoveryService } from "@/lib/services/deployments";
import { roomsService } from "@/lib/services/agents/rooms";
import { usageService } from "@/lib/services/usage";
import { logger } from "@/lib/utils/logger";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";

export const dynamic = "force-dynamic";

// Cache dashboard data for 30 seconds at edge/CDN level
const CACHE_MAX_AGE = 30; // seconds
const STALE_WHILE_REVALIDATE = 60; // serve stale for 60s while revalidating

interface DashboardData {
  user: { name: string };
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
    bio: string | null;
    avatarUrl: string | null;
    category: string | null;
    isPublic: boolean;
    stats?: {
      roomCount: number;
      messageCount: number;
      deploymentStatus: string;
      lastActiveAt: Date | null;
    };
  }>;
  containers: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    ecs_service_arn: string | null;
    load_balancer_url: string | null;
    port: number | null;
    desired_count: number | null;
    cpu: number | null;
    memory: number | null;
    last_deployed_at: Date | null;
    created_at: Date;
    error_message: string | null;
  }>;
}

export async function GET() {
  const user = await requireAuthWithOrg();
  const organizationId = user.organization_id!;
  const cacheKey = CacheKeys.org.dashboard(organizationId);

  const data = await cache.getWithSWR<DashboardData>(
    cacheKey,
    CacheStaleTTL.org.dashboard,
    async () => {
      // PERFORMANCE: Parallelized all data fetches including 24h usage stats
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        generationStats,
        userCharacters,
        containers,
        apiKeys,
        userRooms,
        usageStats,
      ] = await Promise.all([
        generationsService.getStats(organizationId),
        charactersService.listByUser(user.id),
        listContainers(organizationId),
        apiKeysService.listByOrganization(organizationId),
        roomsService.getRoomsForEntity(user.id),
        usageService.getStatsByOrganization(
          organizationId,
          twentyFourHoursAgo,
          new Date(),
        ),
      ]);

      const chatRoomCount = userRooms.length;
      const totalGenerations = generationStats.totalGenerations;
      const imageGenerations =
        generationStats.byType.find((t) => t.type === "image")?.count || 0;
      const videoGenerations =
        generationStats.byType.find((t) => t.type === "video")?.count || 0;
      const apiCalls24h = usageStats.totalRequests;

      // Fetch agent stats in batch
      const characterIds = userCharacters.map((c) => c.id);
      const agentStatsMap = new Map<
        string,
        {
          roomCount: number;
          messageCount: number;
          deploymentStatus: string;
          lastActiveAt: Date | null;
        }
      >();

      if (characterIds.length > 0) {
        try {
          const statsMap =
            await characterDeploymentDiscoveryService.getCharacterStatisticsBatch(
              characterIds,
            );
          statsMap.forEach((stats, id) => {
            agentStatsMap.set(id, {
              roomCount: stats.roomCount,
              messageCount: stats.messageCount,
              deploymentStatus: stats.status,
              lastActiveAt: stats.lastActiveAt,
            });
          });
        } catch (error) {
          logger.error("[Dashboard API] Failed to fetch agent stats:", error);
        }
      }

      return {
        user: { name: user.name || "User" },
        stats: {
          totalGenerations,
          apiCalls24h,
          imageGenerations,
          videoGenerations,
        },
        onboarding: {
          hasAgents: userCharacters.length > 0,
          hasApiKey: apiKeys.some(
            (key) =>
              key.name !== "Default API Key" || (key.usage_count ?? 0) > 0,
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
    },
  );

  if (!data) {
    return NextResponse.json(
      { error: "Failed to load dashboard" },
      { status: 500 },
    );
  }

  // Update user name from auth (not cached)
  data.user.name = user.name || "User";

  return NextResponse.json(data, {
    headers: {
      // Enable CDN caching with stale-while-revalidate for better perceived performance
      "Cache-Control": `private, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    },
  });
}
