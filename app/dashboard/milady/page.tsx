import { BrandCard, ContainersSkeleton } from "@elizaos/cloud-ui";
import { Box } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { MiladySandboxesTable } from "@/packages/ui/src/components/containers/milady-sandboxes-table";

export const metadata: Metadata = {
  title: "Milady Instances",
  description:
    "View, launch, and manage your Milady Cloud instances backed by Eliza Cloud containers.",
};

export const dynamic = "force-dynamic";

export default async function MiladyDashboardPage() {
  const user = await requireAuthWithOrg();
  const sandboxes = await miladySandboxService.listAgents(user.organization_id);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <BrandCard corners={false} className="p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Box className="h-5 w-5 text-[#FF5800]" />
          <div>
            <h1 className="text-lg font-semibold">Milady Instances</h1>
            <p className="text-sm text-neutral-500">
              Launch an existing Milady agent into the web app or create a new managed instance.
            </p>
          </div>
        </div>

        <Suspense fallback={<ContainersSkeleton />}>
          <MiladySandboxesTable sandboxes={sandboxes} />
        </Suspense>
      </BrandCard>
    </div>
  );
}
