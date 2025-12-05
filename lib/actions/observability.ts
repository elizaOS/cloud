"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import {
  getUsageStatsSafe,
  getUsageTimeSeries,
  getCostTrending,
  getProviderBreakdown,
  getModelBreakdown,
  creditsService,
  generationsService,
  organizationsService,
  type TimeGranularity,
} from "@/lib/services";

export interface ObservabilityData {
  // Credit & Billing
  creditBalance: string;
  daysRemaining: number;
  dailySpend: string;
  weeklySpend: string;
  monthlySpend: string;
  todaySpend: string;
  
  // Usage Stats
  apiRequests: number;
  apiRequestsAllTime: number;
  totalCost: string;
  totalCostAllTime: string;
  tokensUsed: number;
  tokensUsedAllTime: number;
  successRate: number;
  
  // Content Generation
  imagesGenerated: number;
  videosGenerated: number;
  
  // Time Series Data for Charts
  dailySpendChart: Array<{ date: string; amount: number }>;
  weeklyUsageChart: Array<{ date: string; requests: number; cost: number; tokens: number }>;
  providerBreakdown: Array<{ provider: string; cost: number; percentage: number }>;
  modelBreakdown: Array<{ model: string; cost: number; requests: number }>;
  successRateHistory: Array<{ date: string; rate: number }>;
}

export async function getObservabilityData(): Promise<ObservabilityData> {
  const user = await requireAuthWithOrg();
  const organizationId = user.organization_id!;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all data in parallel
  const [
    todayStats,
    weekStats,
    monthStats,
    allTimeStats,
    dailyTimeSeries,
    weeklyTimeSeries,
    costTrending,
    providerData,
    modelData,
    generationStats,
    organization,
  ] = await Promise.all([
    getUsageStatsSafe(organizationId, { startDate: today, endDate: now }),
    getUsageStatsSafe(organizationId, { startDate: weekAgo, endDate: now }),
    getUsageStatsSafe(organizationId, { startDate: monthAgo, endDate: now }),
    getUsageStatsSafe(organizationId, {}),
    getUsageTimeSeries(organizationId, { 
      startDate: monthAgo, 
      endDate: now, 
      granularity: "day" as TimeGranularity 
    }),
    getUsageTimeSeries(organizationId, { 
      startDate: weekAgo, 
      endDate: now, 
      granularity: "day" as TimeGranularity 
    }),
    getCostTrending(organizationId),
    getProviderBreakdown(organizationId, { startDate: monthAgo, endDate: now }),
    getModelBreakdown(organizationId, { startDate: monthAgo, endDate: now, limit: 10 }),
    generationsService.getStats(organizationId),
    organizationsService.getById(organizationId),
  ]);

  // Calculate credit metrics
  const creditBalance = Number(organization.credit_balance || 0);
  const avgDailySpend = weekStats.totalCost / 7;
  const daysRemaining = avgDailySpend > 0 ? Math.floor(creditBalance / avgDailySpend) : 999999;

  // Format daily spend chart data
  const dailySpendChart = dailyTimeSeries.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    amount: point.cost,
  }));

  // Format weekly usage chart data
  const weeklyUsageChart = weeklyTimeSeries.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    requests: point.totalRequests,
    cost: point.cost,
    tokens: point.totalInputTokens + point.totalOutputTokens,
  }));

  // Calculate provider breakdown with percentages
  const totalProviderCost = providerData.reduce((sum, p) => sum + p.cost, 0);
  const providerBreakdown = providerData.map(p => ({
    provider: p.provider_name,
    cost: p.cost,
    percentage: totalProviderCost > 0 ? (p.cost / totalProviderCost) * 100 : 0,
  }));

  // Format model breakdown
  const modelBreakdown = modelData.map(m => ({
    model: m.model_name,
    cost: m.cost,
    requests: m.totalRequests,
  }));

  // Calculate success rate history (simulated from time series)
  const successRateHistory = weeklyTimeSeries.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rate: point.totalRequests > 0 
      ? ((point.totalRequests - (point.failedRequests || 0)) / point.totalRequests) * 100 
      : 100,
  }));

  // Content generation stats
  const imagesGenerated = generationStats.byType.find(t => t.type === 'image')?.count || 0;
  const videosGenerated = generationStats.byType.find(t => t.type === 'video')?.count || 0;

  return {
    // Credit & Billing
    creditBalance: `$${creditBalance.toFixed(2)}`,
    daysRemaining,
    dailySpend: `$${avgDailySpend.toFixed(2)}`,
    weeklySpend: `$${weekStats.totalCost.toFixed(2)}`,
    monthlySpend: `$${monthStats.totalCost.toFixed(2)}`,
    todaySpend: `$${todayStats.totalCost.toFixed(2)}`,
    
    // Usage Stats
    apiRequests: weekStats.totalRequests,
    apiRequestsAllTime: allTimeStats.totalRequests,
    totalCost: `$${weekStats.totalCost.toFixed(2)}`,
    totalCostAllTime: `$${allTimeStats.totalCost.toFixed(2)}`,
    tokensUsed: weekStats.totalInputTokens + weekStats.totalOutputTokens,
    tokensUsedAllTime: allTimeStats.totalInputTokens + allTimeStats.totalOutputTokens,
    successRate: weekStats.totalRequests > 0
      ? ((weekStats.totalRequests - (weekStats.failedRequests || 0)) / weekStats.totalRequests) * 100
      : 100,
    
    // Content Generation
    imagesGenerated,
    videosGenerated,
    
    // Chart Data
    dailySpendChart,
    weeklyUsageChart,
    providerBreakdown,
    modelBreakdown,
    successRateHistory,
  };
}
