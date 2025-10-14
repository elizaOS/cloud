"use client";

import { format } from "date-fns";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { UsageChart } from "./usage-chart";
import { AnalyticsFilters } from "./filters";
import { ExportButton } from "./export-button";
import { CostInsightsCard } from "./cost-insights-card";
import { KeyMetricsGrid } from "./key-metrics-grid";
import { ProviderBreakdown } from "./provider-breakdown";
import { ModelBreakdown } from "./model-breakdown";
import { ProjectionsChart } from "./projections-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  BarChart3,
  CalendarRange,
  Coins,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type {
  EnhancedAnalyticsData,
  ProjectionsData,
} from "@/lib/actions/analytics-enhanced";

interface AnalyticsPageClientProps {
  data: EnhancedAnalyticsData;
  projectionsData: ProjectionsData;
}

export function AnalyticsPageClient({
  data,
  projectionsData,
}: AnalyticsPageClientProps) {
  useSetPageHeader({
    title: "Analytics",
    description:
      "Deep visibility into request throughput, spend efficiency, and credit runway",
  });

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
    <>
      <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10 pb-2">
        <div className="space-y-5 lg:max-w-3xl">
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
      <div className="space-y-12 lg:space-y-16">
        <section className="space-y-8 lg:space-y-10">
          <Card className="border-border/70 bg-background/60 shadow-sm">
            <CardHeader className="flex flex-col gap-4 p-6 pb-5">
              <CardTitle className="text-base font-semibold">
                Controls
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Adjust the aggregation cadence and time range to refocus the
                analytics surface. All widgets update in real time.
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
                Overlay throughput, spend, and reliability in a unified timeline
                to expose trend shifts instantly.
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

            <TabsContent
              value="breakdown"
              className="space-y-8 lg:space-y-10 mb-4"
            >
              <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
                <ProviderBreakdown providers={data.providerBreakdown} />
                <ModelBreakdown models={data.modelBreakdown} />
              </div>
            </TabsContent>

            <TabsContent
              value="projections"
              className="space-y-8 lg:space-y-10"
            >
              <ProjectionsChart data={projectionsData} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </>
  );
}
