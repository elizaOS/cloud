import { ContainersSkeleton } from "@elizaos/cloud-ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { getMiladyAgentPublicWebUiUrl } from "@/lib/milady-web-ui";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { MiladyPageWrapper } from "@/packages/ui/src/components/containers/milady-page-wrapper";
import { MiladySandboxesTable } from "@/packages/ui/src/components/containers/milady-sandboxes-table";

export const metadata: Metadata = {
  title: "Milady Instances",
  description: "View, launch, and manage your Milady instances backed by Eliza Cloud containers.",
};

export const dynamic = "force-dynamic";

export default async function MiladyDashboardPage() {
  const user = await requireAuthWithOrg();

  // Milady sandboxes table may not exist in all environments — degrade gracefully
  let sandboxes: Awaited<ReturnType<typeof miladySandboxService.listAgents>> = [];
  try {
    sandboxes = await miladySandboxService.listAgents(user.organization_id);
  } catch {
    // Table likely missing — show empty list
  }

  // Compute canonical Web UI URLs server-side so the client table can link them
  const baseDomain = process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;
  const sandboxesWithUrls = sandboxes.map((sandbox) => ({
    ...sandbox,
    canonical_web_ui_url: getMiladyAgentPublicWebUiUrl(sandbox, { baseDomain }),
  }));

  return (
    <MiladyPageWrapper>
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#FF5800]" />
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
              Instances
            </p>
          </div>
          <h1 className="text-xl font-semibold text-white md:text-2xl">Milady Instances</h1>
          <p className="text-sm text-white/55">
            Launch an existing agent into the web app or create a new managed instance.
          </p>
        </div>

        <Suspense fallback={<ContainersSkeleton />}>
          <MiladySandboxesTable sandboxes={sandboxesWithUrls} />
        </Suspense>
      </div>
    </MiladyPageWrapper>
  );
}
