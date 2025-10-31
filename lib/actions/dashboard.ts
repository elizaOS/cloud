"use server";

import { requireAuth } from "@/lib/auth";
import {
  usageService,
  creditsService,
  generationsService,
  providerHealthService,
} from "@/lib/services";
import { cache as cacheClient } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { cache } from "react";

export interface DashboardData {
  user: {
    name: string;
    email: string | null;
    walletAddress?: string | null;
  };
  organization: {
    name: string;
    creditBalance: number;
    maxApiRequests: number | null;
    maxTokensPerRequest: number | null;
    allowedProviders: string[];
    allowedModels: string[];
  };
  stats: {
    totalGenerations: number;
    apiCalls24h: number;
    imageGenerations: number;
    videoGenerations: number;
    chatGenerations: number;
  };
  usage: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    dailyBurnCredits: number;
    successRate: number;
    burnChange: number;
  };
  modelUsage: Array<{
    model: string;
    provider: string;
    count: number;
    totalCost: number;
  }>;
  creditTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string;
    created_at: Date;
    user_id: string | null;
  }>;
  providerHealth: Array<{
    provider: string;
    status: string;
    responseTime: number;
    errorRate: number;
    lastChecked: Date | null;
  }>;
  recentGenerations: Array<{
    id: string;
    type: string;
    model: string;
    provider: string;
    prompt: string;
    status: string;
    credits: number;
    cost: number;
    error: string | null;
    created_at: Date;
    completed_at: Date | null;
  }>;
}

// Internal function to fetch dashboard data (not cached at React level)
async function fetchDashboardDataInternal(
  user: Awaited<ReturnType<typeof requireAuth>>,
): Promise<DashboardData> {
  const organizationId = user.organization_id;
  const start = Date.now();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    usageStats,
    usageStats24h,
    usageStatsWeek,
    modelUsage,
    creditTransactions,
    providerHealth,
    generationStats,
    recentGenerations,
  ] = await Promise.all([
    usageService.getStatsByOrganization(organizationId),
    usageService.getStatsByOrganization(organizationId, yesterday),
    usageService.getStatsByOrganization(organizationId, weekAgo),
    usageService.getByModel(organizationId),
    creditsService.listTransactionsByOrganization(organizationId, 10),
    providerHealthService.listAll(),
    generationsService.getStats(organizationId),
    generationsService.listByOrganization(organizationId, 20),
  ]);

  const totalGenerations = generationStats.totalGenerations;
  const imageGenerations =
    generationStats.byType.find((t) => t.type === "image")?.count || 0;
  const videoGenerations =
    generationStats.byType.find((t) => t.type === "video")?.count || 0;
  const chatGenerations =
    generationStats.byType.find((t) => t.type === "chat")?.count || 0;

  const dailyBurnCredits = usageStats24h.totalCost;
  const successRate = usageStats.totalRequests > 0 ? 1 : 1;

  const yesterdayBurn = dailyBurnCredits;
  const weekAgoBurn = usageStatsWeek.totalCost;
  const avgDailyBurnLastWeek = weekAgoBurn / 7;
  const burnChange =
    avgDailyBurnLastWeek > 0
      ? ((yesterdayBurn - avgDailyBurnLastWeek) / avgDailyBurnLastWeek) * 100
      : 0;

  return {
    user: {
      name: user.name || "User",
      email: user.email,
      walletAddress: user.wallet_address,
    },
    organization: {
      name: user.organization.name,
      creditBalance: Number.parseFloat(String(user.organization.credit_balance)),
      maxApiRequests: user.organization.max_api_requests || null,
      maxTokensPerRequest: user.organization.max_tokens_per_request || null,
      allowedProviders: user.organization.allowed_providers || [],
      allowedModels: user.organization.allowed_models || [],
    },
    stats: {
      totalGenerations,
      apiCalls24h: usageStats24h.totalRequests,
      imageGenerations,
      videoGenerations,
      chatGenerations,
    },
    usage: {
      totalRequests: usageStats.totalRequests,
      successfulRequests: usageStats.totalRequests,
      failedRequests: 0,
      totalCost: usageStats.totalCost,
      totalInputTokens: usageStats.totalInputTokens,
      totalOutputTokens: usageStats.totalOutputTokens,
      dailyBurnCredits,
      successRate,
      burnChange,
    },
    modelUsage: modelUsage.map((m) => ({
      model: m.model || "Unknown",
      provider: m.provider,
      count: m.count,
      totalCost: m.totalCost,
    })),
    creditTransactions: creditTransactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type,
      description: t.description || `Credit ${t.type}`,
      created_at: t.created_at,
      user_id: t.user_id,
    })),
    providerHealth: providerHealth.map((p) => ({
      provider: p.provider,
      status: p.status,
      responseTime: p.response_time || 0,
      errorRate: p.error_rate ? Number.parseFloat(p.error_rate) : 0,
      lastChecked: p.last_checked,
    })),
    recentGenerations: recentGenerations.map((g) => ({
      id: g.id,
      type: g.type,
      model: g.model,
      provider: g.provider,
      prompt: g.prompt,
      status: g.status,
      credits: Number(g.credits),
      cost: Number(g.cost),
      error: g.error,
      created_at: g.created_at,
      completed_at: g.completed_at,
    })),
  };
}

// React-cached version for request deduplication
export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const user = await requireAuth();
  const organizationId = user.organization_id;
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
