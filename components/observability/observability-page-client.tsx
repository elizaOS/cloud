"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CreditBalanceCard } from "./credit-balance-card";
import { SpendingChart } from "./spending-chart";
import { UsageMetricsChart } from "./usage-metrics-chart";
import { ProviderBreakdownChart } from "./provider-breakdown-chart";
import { SuccessRateCard } from "./success-rate-card";
import { StatsGrid } from "./stats-cards";
import type { ObservabilityData } from "@/lib/actions/observability";

interface ObservabilityPageClientProps {
  data: ObservabilityData;
}

export function ObservabilityPageClient({ data }: ObservabilityPageClientProps) {
  useSetPageHeader({
    title: "Observability",
    description: "Monitor your credits, spending, and usage metrics",
  });

  return (
    <div className="space-y-8 p-8">
      {/* Hero Section - Credit Balance */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CreditBalanceCard
            balance={data.creditBalance}
            daysRemaining={data.daysRemaining}
            dailySpend={data.dailySpend}
            weeklySpend={data.weeklySpend}
          />
        </div>
        <SuccessRateCard
          currentRate={data.successRate}
          history={data.successRateHistory}
        />
      </div>

      {/* Stats Grid */}
      <StatsGrid
        apiRequests={data.apiRequests}
        apiRequestsAllTime={data.apiRequestsAllTime}
        tokensUsed={data.tokensUsed}
        tokensUsedAllTime={data.tokensUsedAllTime}
        totalCost={data.totalCost}
        totalCostAllTime={data.totalCostAllTime}
        imagesGenerated={data.imagesGenerated}
        videosGenerated={data.videosGenerated}
      />

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingChart
          data={data.dailySpendChart}
          title="Daily Spending"
          description="Last 30 days"
        />
        <ProviderBreakdownChart data={data.providerBreakdown} />
      </div>

      {/* Usage Metrics - Full Width */}
      <UsageMetricsChart data={data.weeklyUsageChart} />
    </div>
  );
}
