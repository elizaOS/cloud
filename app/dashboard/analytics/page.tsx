import type { Metadata } from "next";
import { format } from "date-fns";
import {
  getEnhancedAnalyticsData,
  getProjectionsData,
} from "@/lib/actions/analytics-enhanced";
import { UsageChart } from "@/components/analytics/usage-chart";
import { AnalyticsFilters } from "@/components/analytics/filters";
import { ExportButton } from "@/components/analytics/export-button";
import { CostInsightsCard } from "@/components/analytics/cost-insights-card";
import { KeyMetricsGrid } from "@/components/analytics/key-metrics-grid";
import { TopUsersTable } from "@/components/analytics/top-users-table";
import { ProviderBreakdown } from "@/components/analytics/provider-breakdown";
import { ModelBreakdown } from "@/components/analytics/model-breakdown";
import { ProjectionsChart } from "@/components/analytics/projections-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuth } from "@/lib/auth";
import {
  Activity,
  BarChart3,
  CalendarRange,
  Coins,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "View detailed usage statistics, performance metrics, and insights for your AI agents",
  keywords: ["analytics", "statistics", "metrics", "insights", "performance"],
};

interface AnalyticsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    granularity?: "hour" | "day" | "week" | "month";
    timeRange?: "daily" | "weekly" | "monthly";
  }>;
}

export default async function AnalyticsPage(props: AnalyticsPageProps) {
  await requireAuth();

  const searchParams = await props.searchParams;

  const filters = {
    startDate: searchParams.startDate
      ? new Date(searchParams.startDate)
      : undefined,
    endDate: searchParams.endDate ? new Date(searchParams.endDate) : undefined,
    granularity: searchParams.granularity || ("day" as const),
    timeRange: searchParams.timeRange || ("weekly" as const),
  };

  const [data, projectionsData] = await Promise.all([
    getEnhancedAnalyticsData(filters),
    getProjectionsData(7),
  ]);

  const rangeLabel = `${format(data.filters.startDate, "MMM d, yyyy")} → ${format(data.filters.endDate, "MMM d, yyyy")}`;
  const granularityLabel =
    {
      hour: "Hourly",
      day: "Daily",
      week: "Weekly",
      month: "Monthly",
    }[data.filters.granularity] || "Custom";

  const totalTokens =
    data.overallStats.totalInputTokens + data.overallStats.totalOutputTokens;

  const averageCostPerRequest =
    data.overallStats.totalRequests > 0
      ? data.overallStats.totalCost / data.overallStats.totalRequests
      : 0;

  const averageTokensPerRequest =
    data.overallStats.totalRequests > 0
      ? totalTokens / data.overallStats.totalRequests
      : 0;

  const formatDelta = (value: number | undefined, digits = 1) => {
    if (value === undefined || Number.isNaN(value)) return undefined;
    const rounded = Number(value.toFixed(digits));
    const prefix = rounded > 0 ? "+" : "";
    return `${prefix}${rounded.toFixed(digits)}%`;
  };

  const resolveTrend = (value: number | undefined) => {
    if (value === undefined) return undefined;
    if (value > 0) return "up" as const;
    if (value < 0) return "down" as const;
    return "neutral" as const;
  };

  const trendDelta = {
    requests: data.trends.requestsChange,
    cost: data.trends.costChange,
    successRate: data.trends.successRateChange,
    tokens: data.trends.tokensChange,
  };

  const metrics = [
    {
      label: "Total requests",
      value: data.overallStats.totalRequests.toLocaleString(),
      helper: `${granularityLabel} cadence • ${rangeLabel}`,
      delta:
        trendDelta.requests !== 0
          ? {
            value: formatDelta(trendDelta.requests) ?? "0%",
            trend: resolveTrend(trendDelta.requests),
            label: `vs previous period`,
          }
          : undefined,
      icon: Activity,
      accent: "violet" as const,
    },
    {
      label: "Total cost",
      value: `${data.overallStats.totalCost.toLocaleString()} credits`,
      helper: `≈ ${averageCostPerRequest.toFixed(2)} credits per request`,
      delta:
        trendDelta.cost !== 0
          ? {
            value: formatDelta(trendDelta.cost) ?? "0%",
            trend: resolveTrend(trendDelta.cost),
            label: `vs previous period`,
          }
          : undefined,
      icon: Coins,
      accent: "amber" as const,
    },
    {
      label: "Success rate",
      value: `${(data.overallStats.successRate * 100).toFixed(1)}%`,
      helper: `Ratio of successful completions across ${data.timeSeriesData.length.toLocaleString()} data points`,
      delta:
        trendDelta.successRate !== 0
          ? {
            value: formatDelta(trendDelta.successRate, 2) ?? "0%",
            trend: resolveTrend(trendDelta.successRate),
            label: `vs previous period`,
          }
          : undefined,
      icon: ShieldCheck,
      accent: "emerald" as const,
    },
    {
      label: "Token volume",
      value: totalTokens.toLocaleString(),
      helper: `≈ ${averageTokensPerRequest.toFixed(1)} tokens per request`,
      delta:
        trendDelta.tokens !== 0
          ? {
            value: formatDelta(trendDelta.tokens) ?? "0%",
            trend: resolveTrend(trendDelta.tokens),
            label: `vs previous period`,
          }
          : undefined,
      icon: BarChart3,
      accent: "sky" as const,
    },
  ];

  return (
    <div className="space-y-12 lg:space-y-16">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="space-y-5 lg:max-w-3xl">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">Analytics command center</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Deep visibility into request throughput, spend efficiency, and credit runway. Slice by custom ranges and export raw data without losing context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 gap-y-3 text-xs font-medium text-muted-foreground">
            <Badge variant="outline" className="gap-1 rounded-full">
              <CalendarRange className="h-3.5 w-3.5" />
              {rangeLabel}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              Granularity: {granularityLabel}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {data.timeSeriesData.length.toLocaleString()} data points
            </Badge>
          </div>
        </div>
        <ExportButton
          startDate={data.filters.startDate}
          endDate={data.filters.endDate}
          granularity={data.filters.granularity}
          variant="dropdown"
        />
      </section>

      <section className="space-y-8 lg:space-y-10">
        <Card className="border-border/70 bg-background/60 shadow-sm">
          <CardHeader className="flex flex-col gap-4 p-6 pb-5">
            <CardTitle className="text-base font-semibold">Controls</CardTitle>
            <p className="text-sm text-muted-foreground">
              Adjust the aggregation cadence and time range to refocus the analytics surface. All widgets update in real time.
            </p>
          </CardHeader>
          <CardContent className="border-t border-border/60 p-6">
            <AnalyticsFilters />
          </CardContent>
        </Card>

        <KeyMetricsGrid metrics={metrics} />
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10">
        <Card className="border-border/70 bg-background/60 shadow-sm">
          <CardHeader className="flex flex-col gap-3 p-6 pb-5">
            <CardTitle className="text-base font-semibold">
              Usage visibility
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Overlay throughput, spend, and reliability in a unified timeline to expose trend shifts instantly.
            </p>
          </CardHeader>
          <CardContent className="border-t border-border/60 p-6">
            <UsageChart
              data={data.timeSeriesData}
              granularity={data.filters.granularity}
            />
          </CardContent>
        </Card>

        <CostInsightsCard
          costTrending={data.costTrending}
          creditBalance={data.organization.creditBalance}
        />
      </section>

      <section className="space-y-8 lg:space-y-10">
        <Tabs defaultValue="breakdown" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
            <TabsTrigger value="projections">
              <TrendingUp className="mr-2 h-4 w-4" />
              Projections
            </TabsTrigger>
          </TabsList>

          <TabsContent value="breakdown" className="space-y-8 lg:space-y-10 mb-4">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
              <ProviderBreakdown providers={data.providerBreakdown} />
              <ModelBreakdown models={data.modelBreakdown} />
            </div>

            {/* <TopUsersTable users={data.userBreakdown} /> */}
          </TabsContent>

          <TabsContent value="projections" className="space-y-8 lg:space-y-10">
            <ProjectionsChart data={projectionsData} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
