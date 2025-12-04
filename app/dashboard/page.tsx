import type { Metadata } from "next";
import { Suspense } from "react";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import { getDashboardData } from "@/lib/actions/dashboard";
import { DashboardPageWrapper } from "@/components/dashboard/dashboard-page-wrapper";
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics";
import {
  AgentsSection,
  AgentsSectionSkeleton,
} from "@/components/dashboard/agents-section";
import {
  ContainersSection,
  ContainersSectionSkeleton,
} from "@/components/dashboard/containers-section";
import {
  GettingStarted,
  GettingStartedSkeleton,
} from "@/components/dashboard/getting-started";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.dashboard,
  path: "/dashboard",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  const { hasAgents, hasApiKey, hasChatHistory } = data.onboarding;
  const hasActivity = data.stats.totalGenerations > 0;
  const allOnboardingComplete = hasAgents && hasApiKey && hasChatHistory;

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 lg:px-8">
        <div className="space-y-12">
          {!allOnboardingComplete && (
            <Suspense fallback={<GettingStartedSkeleton />}>
              <GettingStarted
                hasAgents={hasAgents}
                hasApiKey={hasApiKey}
                hasChatHistory={hasChatHistory}
              />
            </Suspense>
          )}

          <section>
            <Suspense fallback={<AgentsSectionSkeleton />}>
              <AgentsSection agents={data.agents} />
            </Suspense>
          </section>

          {hasActivity && (
            <section className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Overview</h2>
              </div>
              <Suspense fallback={<OverviewMetricsSkeleton />}>
                <OverviewMetrics
                  totalGenerations={data.stats.totalGenerations}
                  apiCalls24h={data.stats.apiCalls24h}
                  imageGenerations={data.stats.imageGenerations}
                  videoRenders={data.stats.videoGenerations}
                />
              </Suspense>
            </section>
          )}

          <section>
            <Suspense fallback={<ContainersSectionSkeleton />}>
              <ContainersSection containers={data.containers} />
            </Suspense>
          </section>
        </div>
      </main>
    </DashboardPageWrapper>
  );
}
