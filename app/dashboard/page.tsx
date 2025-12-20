import type { Metadata } from "next";
import { Suspense } from "react";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import { getDashboardData } from "@/lib/actions/dashboard";
import { DashboardPageWrapper } from "@/components/dashboard/dashboard-page-wrapper";
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

export const dynamic = "force-dynamic";

/**
 * Main dashboard page displaying user's agents and containers.
 *
 * @returns Dashboard page with agents and containers sections.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-8 pt-6 lg:px-8">
        <div className="space-y-8">
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
