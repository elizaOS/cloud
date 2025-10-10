"use server";

import { requireAuth } from "@/lib/auth";
import {
  usageService,
  creditsService,
  generationsService,
  providerHealthService,
} from "@/lib/services";

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
