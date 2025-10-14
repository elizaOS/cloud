import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Image, Video, MessageSquare } from "lucide-react";

import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardPageWrapper } from "@/components/dashboard/dashboard-page-wrapper";
import {
  UsageOverview,
  type UsageMetric,
} from "@/components/dashboard/usage-overview";
import {
  ActivityFeed,
  type ActivityFeedItem,
} from "@/components/dashboard/activity-feed";
import { UsagePerformance } from "@/components/dashboard/usage-performance";
import {
  ModelUsageCard,
  type ModelUsageEntry,
} from "@/components/dashboard/model-usage-card";
import {
  CreditActivity,
  type CreditActivityProps,
} from "@/components/dashboard/credit-activity";
import { PlanLimitsCard } from "@/components/dashboard/plan-limits-card";
import {
  ProviderHealthCard,
  type ProviderHealthItem,
} from "@/components/dashboard/provider-health-card";
import {
  UsageAlertsCard,
  type UsageAlertItem,
} from "@/components/dashboard/usage-alerts-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDashboardData } from "@/lib/actions/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "View your AI agent dashboard, analytics, and quick actions",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

function generateUsageAlerts(
  data: Awaited<ReturnType<typeof getDashboardData>>,
): UsageAlertItem[] {
  const alerts: UsageAlertItem[] = [];

  const degradedProviders = data.providerHealth.filter(
    (p) => p.status === "degraded",
  );
  for (const provider of degradedProviders) {
    alerts.push({
      id: `alert-${provider.provider.toLowerCase()}-degraded`,
      title: `${provider.provider} provider degraded`,
      description: `Response time at ${provider.responseTime}ms with ${(provider.errorRate * 100).toFixed(1)}% error rate. Monitor performance and consider routing to alternative providers.`,
      severity: "warning",
      actionLabel: "View provider detail",
    });
  }

  const daysRemaining = Math.floor(
    data.organization.creditBalance / (data.usage.dailyBurnCredits || 1),
  );
  if (daysRemaining < 90 && daysRemaining > 0) {
    alerts.push({
      id: "alert-budget-horizon",
      title: `Projected budget runway: ${daysRemaining} days`,
      description: `Daily burn of ${data.usage.dailyBurnCredits.toLocaleString()} credits. Consider reviewing usage patterns and optimizing API calls.`,
      severity: daysRemaining < 30 ? "warning" : "info",
      actionLabel: "Open spend report",
    });
  }

  if (data.organization.creditBalance < 10000) {
    alerts.push({
      id: "alert-low-credits",
      title: "Credit balance running low",
      description: `Current balance: ${data.organization.creditBalance.toLocaleString()} credits. Consider purchasing more credits to avoid service interruption.`,
      severity: "warning",
      actionLabel: "Purchase credits",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "alert-all-good",
      title: "All systems operational",
      description:
        "Your infrastructure is running smoothly. All providers are healthy and credit balance is sufficient.",
      severity: "info",
      actionLabel: "View analytics",
    });
  }

  return alerts;
}

function generateActivityFeed(
  data: Awaited<ReturnType<typeof getDashboardData>>,
): ActivityFeedItem[] {
  const activities: ActivityFeedItem[] = [];

  for (const gen of data.recentGenerations) {
    const typeIcon =
      gen.type === "image"
        ? Image
        : gen.type === "video"
          ? Video
          : MessageSquare;

    let status: ActivityFeedItem["status"] = "info";
    const statusText = gen.status;

    if (gen.status === "completed") {
      status = "success";
    } else if (gen.status === "failed") {
      status = "error";
    } else if (gen.status === "pending") {
      status = "info";
    }

    const timeAgo = gen.completed_at
      ? new Date(gen.completed_at).toLocaleString()
      : new Date(gen.created_at).toLocaleString();

    const promptPreview =
      gen.prompt.length > 60 ? `${gen.prompt.substring(0, 60)}...` : gen.prompt;

    const description = gen.error
      ? `Error: ${gen.error}`
      : `${gen.model} · ${gen.credits} credits · "${promptPreview}"`;

    activities.push({
      id: gen.id,
      title: `${gen.type.charAt(0).toUpperCase()}${gen.type.slice(1)} generation ${statusText}`,
      description: description,
      icon: typeIcon,
      status: status,
      timestamp: timeAgo,
      metadata: gen.provider,
    });
  }

  if (activities.length === 0) {
    activities.push({
      id: "activity-default",
      title: "No generations yet",
      description:
        "Start generating images, videos, or chat completions to see activity here.",
      icon: Sparkles,
      status: "info",
      timestamp: "Now",
      metadata: "system",
    });
  }

  return activities;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const heroStats = [
    {
      label: "Total generations",
      value: data.stats.totalGenerations.toLocaleString(),
      hint: `${data.stats.imageGenerations} images, ${data.stats.videoGenerations} videos`,
    },
    {
      label: "API calls (24h)",
      value: data.stats.apiCalls24h.toLocaleString(),
      hint: `${data.usage.successfulRequests} successful`,
    },
    {
      label: "Image generations",
      value: data.stats.imageGenerations.toLocaleString(),
      hint: "All time",
    },
    {
      label: "Video renders",
      value: data.stats.videoGenerations.toLocaleString(),
      hint: "All time",
    },
  ];

  const usageMetrics: UsageMetric[] = [
    {
      label: "Credits remaining",
      value: data.organization.creditBalance.toLocaleString(),
      description: "Current organization credit balance",
      icon: "fuel",
      accent: "border-primary/60 bg-primary/10",
      trend: {
        direction: "neutral",
        label: `${data.usage.dailyBurnCredits.toLocaleString()} daily burn`,
      },
    },
    {
      label: "Daily spend",
      value: `${data.usage.dailyBurnCredits.toLocaleString()} cr`,
      description: "Credits spent in last 24 hours",
      icon: "creditCard",
      accent: "border-emerald-500/60 bg-emerald-500/10",
      trend: {
        direction:
          data.usage.burnChange > 0
            ? "up"
            : data.usage.burnChange < 0
              ? "down"
              : "neutral",
        label: `${data.usage.burnChange >= 0 ? "+" : ""}${data.usage.burnChange.toFixed(1)}% vs last week avg`,
      },
    },
    {
      label: "Success rate",
      value: `${(data.usage.successRate * 100).toFixed(1)}%`,
      description: "API operations success rate",
      icon: "shieldCheck",
      accent: "border-blue-500/60 bg-blue-500/10",
      trend: {
        direction:
          data.usage.successRate >= 0.99
            ? "up"
            : data.usage.successRate >= 0.95
              ? "neutral"
              : "down",
        label: `${data.usage.failedRequests} failed requests`,
      },
    },
  ];

  const usageFootnote = (
    <span>
      Track your credit usage and spending patterns. Manage billing settings in
      the{" "}
      <Link
        href="/dashboard/account"
        className="text-primary underline-offset-2 hover:underline"
      >
        account console
      </Link>
      .
    </span>
  );

  const usagePerformanceStats = {
    totalRequests: data.usage.totalRequests,
    successfulRequests: data.usage.successfulRequests,
    failedRequests: data.usage.failedRequests,
    totalCost: data.usage.totalCost,
    totalInputTokens: data.usage.totalInputTokens,
    totalOutputTokens: data.usage.totalOutputTokens,
  };

  const usageAlerts = generateUsageAlerts(data);

  const modelUsageItems: ModelUsageEntry[] = data.modelUsage.slice(0, 6);

  const creditTransactions: CreditActivityProps["transactions"] =
    data.creditTransactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type as "purchase" | "usage" | "adjustment" | "refund",
      description: t.description,
      created_at: t.created_at,
      actor: t.user_id ? undefined : undefined,
    }));

  const planLimits = {
    maxApiRequests: data.organization.maxApiRequests,
    maxTokensPerRequest: data.organization.maxTokensPerRequest,
    allowedProviders: data.organization.allowedProviders,
    allowedModels: data.organization.allowedModels,
    autoTopUp: false,
    nextReset: undefined,
  };

  const providerHealth: ProviderHealthItem[] = data.providerHealth.map((p) => ({
    provider: p.provider,
    status: p.status as "healthy" | "degraded" | "down",
    responseTime: p.responseTime,
    errorRate: p.errorRate,
    lastChecked: p.lastChecked,
  }));

  const activityItems = generateActivityFeed(data);

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 lg:px-8">
        <div className="flex flex-col gap-6">
          <DashboardHero
            userName={data.user.name.split(" ")[0] || "User"}
            organizationName={data.organization.name}
            creditBalance={data.organization.creditBalance}
            stats={heroStats}
            primaryAction={{
              label: "Manage account",
              href: "/dashboard/account",
            }}
            secondaryAction={{
              label: "View analytics",
              href: "/dashboard/analytics",
            }}
            className="rounded-3xl border border-border/60 bg-background/90 shadow-sm"
          />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="limits">Limits & Health</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <div className="grid gap-6 lg:grid-cols-3">
                <UsageOverview
                  metrics={usageMetrics}
                  footnote={usageFootnote}
                  className="lg:col-span-2"
                />
                <UsageAlertsCard alerts={usageAlerts} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <UsagePerformance stats={usagePerformanceStats} />
                <div className="grid gap-6">
                  <PlanLimitsCard {...planLimits} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-6 space-y-6">
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <ActivityFeed
                    items={activityItems}
                    title="Recent generations"
                    description="Latest image, video, and chat generations across your organization."
                    footerAction={
                      <div className="flex w-full justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/dashboard/gallery">
                            View all generations
                            <Sparkles className="ml-2 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    }
                  />
                </div>
                <div className="flex flex-col gap-6 lg:col-span-5">
                  <ModelUsageCard items={modelUsageItems} />
                  <CreditActivity transactions={creditTransactions} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <PlanLimitsCard {...planLimits} />
                <ProviderHealthCard items={providerHealth} />
              </div>
              <UsageAlertsCard alerts={usageAlerts} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </DashboardPageWrapper>
  );
}
