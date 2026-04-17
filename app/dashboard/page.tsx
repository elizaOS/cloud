import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Suspense } from "react";
import { getDashboardData } from "@/lib/actions/dashboard";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import {
  AgentsSection,
  AgentsSectionSkeleton,
} from "@/packages/ui/src/components/dashboard/agents-section";
import {
  DashboardActionCards,
  DashboardActionCardsSkeleton,
} from "@/packages/ui/src/components/dashboard/dashboard-action-cards";
import { DashboardPageWrapper } from "@/packages/ui/src/components/dashboard/dashboard-page-wrapper";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.dashboard,
  path: "/dashboard",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * Main dashboard page displaying quick actions and agents.
 *
 * @returns Dashboard page with action cards and agents section.
 */
export default async function DashboardPage() {
  let data;
  try {
    data = await getDashboardData();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("Forbidden"))
    ) {
      redirect(`/login?returnTo=${encodeURIComponent("/dashboard")}`);
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
              <DashboardActionCards creditBalance={data.stats.creditBalance} />
            </Suspense>
          </section>

          <section>
            <Suspense fallback={<AgentsSectionSkeleton />}>
              <AgentsSection agents={data.agents} />
            </Suspense>
          </section>
        </div>
      </main>
    </DashboardPageWrapper>
  );
}
