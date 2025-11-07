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

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.dashboard,
  path: "/dashboard",
  noIndex: true,
});

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 lg:px-8">
        <div className="space-y-12">
          {/* Page Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Dashboard
            </h1>
            <p className="text-white/60 text-lg">
              Quickly see how things are going
            </p>
          </div>

          {/* Overview Section */}
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

          {/* Agents Section */}
          <section>
            <Suspense fallback={<AgentsSectionSkeleton />}>
              <AgentsSection agents={data.agents} />
            </Suspense>
          </section>

          {/* Containers Section */}
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
