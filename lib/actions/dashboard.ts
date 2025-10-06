"use server";

import { requireAuth } from "@/lib/auth";
import {
  getUsageStatsByOrganization,
  getUsageByModel,
} from "@/lib/queries/usage";
import { getCreditTransactionsByOrganization } from "@/lib/queries/credits";
import { listProviderHealth } from "@/lib/queries/provider-health";
import {
  getGenerationStats,
  listGenerationsByOrganization,
} from "@/lib/queries/generations";

export async function getDashboardData() {
  const user = await requireAuth();
  const organizationId = user.organization_id;

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
    getUsageStatsByOrganization(organizationId),
    getUsageStatsByOrganization(organizationId, { startDate: yesterday }),
    getUsageStatsByOrganization(organizationId, { startDate: weekAgo }),
    getUsageByModel(organizationId),
    getCreditTransactionsByOrganization(organizationId, { limit: 10 }),
    listProviderHealth(),
    getGenerationStats(organizationId),
    listGenerationsByOrganization(organizationId, { limit: 20 }),
  ]);

  const totalGenerations = generationStats.totalGenerations;
  const imageGenerations =
    generationStats.byType.find((t) => t.type === "image")?.count || 0;
  const videoGenerations =
    generationStats.byType.find((t) => t.type === "video")?.count || 0;
  const chatGenerations =
    generationStats.byType.find((t) => t.type === "chat")?.count || 0;

  const dailyBurnCredits = usageStats24h.totalCost;
  const successRate =
    usageStats.totalRequests > 0
      ? usageStats.successfulRequests / usageStats.totalRequests
      : 1;

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
    },
    organization: {
      name: user.organization.name,
      creditBalance: user.organization.credit_balance,
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
      successfulRequests: usageStats.successfulRequests,
      failedRequests: usageStats.failedRequests,
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
      amount: t.amount,
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
      credits: g.credits,
      cost: g.cost,
      error: g.error,
      created_at: g.created_at,
      completed_at: g.completed_at,
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
