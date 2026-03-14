import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Suspense } from "react";
import { AgentsSection, AgentsSectionSkeleton } from "@/components/dashboard/agents-section";
import {
  DashboardActionCards,
  DashboardActionCardsSkeleton,
} from "@/components/dashboard/dashboard-action-cards";
import { DashboardPageWrapper } from "@/components/dashboard/dashboard-page-wrapper";
import { getDashboardData } from "@/lib/actions/dashboard";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import {
  ContainersSection,
  ContainersSectionSkeleton,
} from "@/components/dashboard/containers-section";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.dashboard,
  path: "/dashboard",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * Main dashboard page displaying quick actions, agents, and containers.
 *
 * @returns Dashboard page with action cards, agents, and containers sections.
 */
export default async function DashboardPage() {
  let data;
  try {
    data = await getDashboardData();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") || error.message.includes("Forbidden"))
    ) {
      redirect("/login");
    }
    throw error;
  }

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px]">
        <div className="space-y-8 mt-8">
          {/* Quick Action Cards */}
          <section>
            <Suspense fallback={<DashboardActionCardsSkeleton />}>
              <DashboardActionCards
                creditBalance={data.stats.creditBalance}
              />
            </Suspense>
          </section>

          <section>
            <Suspense fallback={<AgentsSectionSkeleton />}>
              <AgentsSection agents={data.agents} />
            </Suspense>
          </section>

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

