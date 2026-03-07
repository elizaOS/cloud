import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAuthWithOrg } from "@/lib/auth";
import { listContainers } from "@/lib/services/containers";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";
import { Server, Activity, TrendingUp, AlertCircle } from "lucide-react";
import { ContainersPageWrapper } from "./containers-page-wrapper";
import { ContainersEmptyState } from "./containers-empty-state";
import { DeployFromCLI } from "./deploy-from-cli";
import { BrandCard, DashboardStatCard } from "@/components/brand";

export const metadata: Metadata = {
  title: "Containers",
  description:
    "Deploy and manage elizaOS containers. Monitor health, view logs, and scale your AI agent deployments with our cloud infrastructure.",
};

export const dynamic = "force-dynamic";

/**
 * Containers page displaying all containers deployed by the authenticated user's organization.
 * Shows statistics (total, running, building, failed) and a table of containers.
 */
export default async function ContainersPage() {
  const user = await requireAuthWithOrg();
  const containers = await listContainers(user.organization_id);

  const stats = {
    total: containers.length,
    running: containers.filter((c) => c.status === "running").length,
    stopped: containers.filter((c) => c.status === "stopped").length,
    failed: containers.filter((c) => c.status === "failed").length,
    building: containers.filter(
      (c) =>
        c.status === "building" ||
        c.status === "deploying" ||
        c.status === "pending",
    ).length,
  };

  return (
    <ContainersPageWrapper>
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        {/* Stats Grid - only show when containers exist */}
        {containers.length > 0 && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <DashboardStatCard
              label="Total Containers"
              value={stats.total}
              accent="orange"
              icon={<Server className="h-5 w-5 text-[#FF5800]" />}
            />
            <DashboardStatCard
              label="Running"
              value={stats.running}
              accent="emerald"
              icon={<Activity className="h-5 w-5 text-green-500" />}
            />
            <DashboardStatCard
              label="Building"
              value={stats.building}
              accent="amber"
              icon={<TrendingUp className="h-5 w-5 text-yellow-500" />}
            />
            <DashboardStatCard
              label="Issues"
              value={stats.failed}
              accent="red"
              icon={<AlertCircle className="h-5 w-5 text-red-500" />}
            />
          </div>
        )}

        {/* Containers Table or Empty State */}
        {containers.length === 0 ? (
          <ContainersEmptyState />
        ) : (
          <>
            {/* Deploy from CLI helper */}
            <DeployFromCLI />

            {/* Table */}
            <BrandCard corners={false} className="p-4 md:p-6">
              <Suspense fallback={<ContainersSkeleton />}>
                <ContainersTable containers={containers} />
              </Suspense>
            </BrandCard>
          </>
        )}
      </div>
    </ContainersPageWrapper>
  );
}
