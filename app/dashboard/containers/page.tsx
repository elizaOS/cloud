import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { listContainers } from "@/lib/services";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";
import { Terminal, Server, TrendingUp, Activity } from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await requireAuth();
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
    <div className="container mx-auto py-10 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Containers
          </h1>
          <p className="text-white/60 mt-2 text-lg">
            Manage your deployed ElizaOS containers
          </p>
        </div>
      </div>

      {/* Stats Overview - Only show if there are containers */}
      {containers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <BrandCard corners={false} className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-none bg-blue-500/20 border border-blue-500/40">
                <Server className="h-4 w-4 text-blue-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide">
                Total Containers
              </p>
              <p className="text-3xl font-bold mt-1 text-white">{stats.total}</p>
            </div>
          </BrandCard>

          <BrandCard corners={false} className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-none bg-green-500/20 border border-green-500/40">
                <Activity className="h-4 w-4 text-green-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide">
                Running
              </p>
              <p className="text-3xl font-bold mt-1 text-green-400">
                {stats.running}
              </p>
            </div>
          </BrandCard>

          <BrandCard corners={false} className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-none bg-yellow-500/20 border border-yellow-500/40">
                <TrendingUp className="h-4 w-4 text-yellow-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide">
                Building
              </p>
              <p className="text-3xl font-bold mt-1 text-yellow-400">
                {stats.building}
              </p>
            </div>
          </BrandCard>

          <BrandCard corners={false} className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-none bg-rose-500/20 border border-rose-500/40">
                <Activity className="h-4 w-4 text-rose-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide">
                Issues
              </p>
              <p className="text-3xl font-bold mt-1 text-rose-400">
                {stats.failed}
              </p>
            </div>
          </BrandCard>
        </div>
      )}

      {/* Quick Start Card - Show prominently when no containers exist */}
      {containers.length === 0 ? (
        <BrandCard className="relative border-dashed">
          <CornerBrackets size="md" className="opacity-50" />
          <div className="relative z-10 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-6 w-6 text-[#FF5800]" />
                <h3 className="text-2xl font-bold text-white">Get Started with ElizaOS</h3>
              </div>
              <p className="text-base text-white/60">
                Deploy your first ElizaOS container using the command line
              </p>
            </div>
            <div className="space-y-4">
              <div className="bg-black/60 border border-white/10 p-5 rounded-none font-mono text-sm">
                <div className="text-white/50 mb-2 font-sans">
                  # Install ElizaOS CLI
                </div>
                <div className="text-white font-semibold">
                  bun install -g @elizaos/cli
                </div>

                <div className="text-white/50 mt-4 mb-2 font-sans">
                  # Deploy your project
                </div>
                <div className="text-white">cd your-elizaos-project</div>
                <div className="text-white font-semibold">
                  elizaos deploy
                </div>
              </div>
              <p className="text-sm text-white/60">
                Once deployed, you&apos;ll be able to view deployment history,
                logs, and metrics for your container right here.
              </p>
            </div>
          </div>
        </BrandCard>
      ) : (
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-50" />
          <div className="relative z-10 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-5 w-5 text-[#FF5800]" />
                <h3 className="text-lg font-bold text-white">Deploy from CLI</h3>
              </div>
              <p className="text-sm text-white/60">
                Deploy additional ElizaOS projects using the command line
              </p>
            </div>
            <div className="bg-black/60 border border-white/10 p-4 rounded-none font-mono text-sm">
              <div className="text-white/50 mb-2">
                # From your ElizaOS project directory
              </div>
              <div className="text-white">elizaos deploy</div>
            </div>
          </div>
        </BrandCard>
      )}

      <Suspense fallback={<ContainersSkeleton />}>
        <ContainersTable containers={containers} />
      </Suspense>
    </div>
  );
}
