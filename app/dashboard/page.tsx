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
import {
  GettingStarted,
  GettingStartedSkeleton,
} from "@/components/dashboard/getting-started";
import {
  WelcomeHero,
  WelcomeHeroSkeleton,
} from "@/components/dashboard/welcome-hero";
import {
  FeaturesShowcase,
  FeaturesShowcaseSkeleton,
} from "@/components/dashboard/features-showcase";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.dashboard,
  path: "/dashboard",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  const { hasAgents, hasApiKey } = data.onboarding;
  const hasContainers = data.containers.length > 0;
  
  // Show onboarding for users who haven't deployed yet
  const showOnboarding = !hasContainers;

  return (
    <DashboardPageWrapper userName={data.user.name.split(" ")[0] || "User"}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 lg:px-8">
        <div className="space-y-10">
          {/* Welcome Hero - Always show at top */}
          <Suspense fallback={<WelcomeHeroSkeleton />}>
            <WelcomeHero userName={data.user.name.split(" ")[0] || "User"} />
          </Suspense>

          {/* Getting Started CLI Flow - Show until user has deployed containers */}
          {showOnboarding && (
            <Suspense fallback={<GettingStartedSkeleton />}>
              <GettingStarted
                hasAgents={hasAgents}
                hasApiKey={hasApiKey}
                hasChatHistory={hasContainers}
              />
            </Suspense>
          )}

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

          {/* Features Showcase - Platform capabilities */}
          <Suspense fallback={<FeaturesShowcaseSkeleton />}>
            <FeaturesShowcase />
          </Suspense>
        </div>
      </main>
    </DashboardPageWrapper>
  );
}
