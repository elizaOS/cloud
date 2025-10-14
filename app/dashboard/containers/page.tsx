import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { listContainers } from "@/lib/services";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await requireAuth();
  const containers = await listContainers(user.organization_id);

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Containers</h1>
          <p className="text-muted-foreground mt-2">
            Manage your deployed ElizaOS containers
          </p>
        </div>
      </div>

      {/* Quick Start Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Deploy from CLI
          </CardTitle>
          <CardDescription>
            Deploy your ElizaOS project using the command line
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="bg-muted p-4 rounded-md font-mono text-sm">
              <div className="text-muted-foreground mb-2"># Install ElizaOS CLI</div>
              <div>bun install -g @elizaos/cli</div>
              
              <div className="text-muted-foreground mt-4 mb-2"># Deploy your project</div>
              <div>cd your-elizaos-project</div>
              <div>elizaos deploy</div>
            </div>
            <p className="text-sm text-muted-foreground">
              Click the details icon (📄) in the table to view deployment history and logs for each container.
            </p>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={<ContainersSkeleton />}>
        <ContainersTable containers={containers} />
      </Suspense>
    </div>
  );
}
