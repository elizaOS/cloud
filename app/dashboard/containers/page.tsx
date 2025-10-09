import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { listContainers } from "@/lib/queries/containers";
import { ContainersTable } from "@/components/containers/containers-table";
import { ContainersSkeleton } from "@/components/containers/containers-skeleton";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await requireAuth();
  const containers = await listContainers(user.organization_id);

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Containers</h1>
          <p className="text-muted-foreground mt-2">
            Manage your deployed ElizaOS containers
          </p>
        </div>
      </div>

      <Suspense fallback={<ContainersSkeleton />}>
        <ContainersTable containers={containers} />
      </Suspense>
    </div>
  );
}
