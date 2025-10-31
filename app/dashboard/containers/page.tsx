import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { listContainers } from "@/lib/services";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Terminal, Server, TrendingUp, Activity } from "lucide-react";

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
        c.status === "pending"
    ).length,
  };

  return (
    <div className="container mx-auto py-10 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Containers
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage your deployed ElizaOS containers
          </p>
        </div>
      </div>

      {/* Stats Overview - Only show if there are containers */}
      {containers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-blue-500/10">
                  <Server className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Containers
                </p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-green-500/10">
                  <Activity className="h-4 w-4 text-green-500" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Running
                </p>
                <p className="text-3xl font-bold mt-1 text-green-500">
                  {stats.running}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-yellow-500/10">
                  <TrendingUp className="h-4 w-4 text-yellow-500" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Building
                </p>
                <p className="text-3xl font-bold mt-1 text-yellow-500">
                  {stats.building}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 rounded-md bg-red-500/10">
                  <Activity className="h-4 w-4 text-red-500" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Issues
                </p>
                <p className="text-3xl font-bold mt-1 text-red-500">
                  {stats.failed}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Start Card - Show prominently when no containers exist */}
      {containers.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Terminal className="h-6 w-6" />
              Get Started with ElizaOS
            </CardTitle>
            <CardDescription className="text-base">
              Deploy your first ElizaOS container using the command line
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-muted p-5 rounded-lg font-mono text-sm">
                <div className="text-muted-foreground mb-2 font-sans">
                  # Install ElizaOS CLI
                </div>
                <div className="text-foreground font-semibold">
                  bun install -g @elizaos/cli
                </div>

                <div className="text-muted-foreground mt-4 mb-2 font-sans">
                  # Deploy your project
                </div>
                <div className="text-foreground">cd your-elizaos-project</div>
                <div className="text-foreground font-semibold">
                  elizaos deploy
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Once deployed, you&apos;ll be able to view deployment history, logs,
                and metrics for your container right here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Deploy from CLI
            </CardTitle>
            <CardDescription>
              Deploy additional ElizaOS projects using the command line
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md font-mono text-sm">
              <div className="text-muted-foreground mb-2">
                # From your ElizaOS project directory
              </div>
              <div>elizaos deploy</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={<ContainersSkeleton />}>
        <ContainersTable containers={containers} />
      </Suspense>
    </div>
  );
}
