// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
/**
 * Apps list — manage apps your agents have created.
 *
 * Agent-first UX: most apps are built end-to-end by an agent skill
 * (see docs/agent-skill-build-monetized-app.md). The manual
 * "Create App" button is preserved behind an "Advanced" expander
 * for users integrating an existing external website (where the
 * code already lives somewhere — they just need to register it
 * with the cloud and grab an API key).
 *
 * Container-path only: the vercel-coupled codebuilder at
 * /dashboard/apps/create stays disabled (redirects here).
 */

import { DashboardStatCard } from "@elizaos/cloud-ui";
import { Activity, ChevronDown, Grid3x3, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { AppsPageWrapper } from "@/packages/ui/src/components/apps/apps-page-wrapper";
import { AppsTable } from "@/packages/ui/src/components/apps/apps-table";
import { CreateAppButton } from "@/packages/ui/src/components/apps/create-app-button";
import { AppsEmptyState } from "@/packages/ui/src/components/apps-empty-state";
import { AppsSkeleton } from "@/packages/ui/src/components/apps-skeleton";

export const metadata: Metadata = {
  title: "Apps",
  description:
    "Manage apps your agents created. Toggle monetization, view earnings, deploy as containers.",
};

/**
 * Native <details> expander wrapping the manual create button. Renders
 * the same pattern in both the page header (when apps exist) and the
 * empty state, so users always see "Advanced ▾ → Register manually" as
 * a consistent escape hatch from the agent-first default.
 */
function AdvancedRegisterApp() {
  return (
    <details className="group inline-block">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-sm text-white/60 hover:text-white transition-colors font-mono">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        Advanced
      </summary>
      <div className="mt-2">
        <CreateAppButton />
      </div>
    </details>
  );
}

export default async function AppsPage() {
  const user = await requireAuthWithOrg();
  const apps = await appsService.listByOrganization(user.organization_id);

  const totalUsers = apps.reduce((sum, app) => sum + app.total_users, 0);
  const totalRequests = apps.reduce((sum, app) => sum + app.total_requests, 0);
  const activeCount = apps.filter((a) => a.is_active).length;

  return (
    <AppsPageWrapper>
      <div className="w-full max-w-[1400px] mx-auto space-y-3 md:space-y-6">
        <div className="flex items-center justify-end">
          <AdvancedRegisterApp />
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 min-w-0" data-onboarding="apps-stats">
          <DashboardStatCard
            label="Total Apps"
            value={apps.length}
            icon={<Grid3x3 className="h-5 w-5 text-[#FF5800]" />}
          />
          <DashboardStatCard
            label="Active Apps"
            value={activeCount}
            icon={<Activity className="h-5 w-5 text-green-500" />}
          />
          <DashboardStatCard
            label="Total Users"
            value={totalUsers.toLocaleString()}
            icon={<Users className="h-5 w-5 text-blue-500" />}
          />
          <DashboardStatCard
            label="Total Requests"
            value={totalRequests.toLocaleString()}
            icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
          />
        </div>
        {apps.length === 0 ? (
          <AppsEmptyState
            description="Your agent will create apps here when you have it build something."
            action={<AdvancedRegisterApp />}
          />
        ) : (
          <Suspense fallback={<AppsSkeleton />}>
            <AppsTable apps={apps} />
          </Suspense>
        )}
      </div>
    </AppsPageWrapper>
  );
}
