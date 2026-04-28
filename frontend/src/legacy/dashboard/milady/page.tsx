// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
import { ContainersSkeleton } from "@elizaos/cloud-ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAuthWithOrg } from "@/lib/auth";
import { getElizaAgentPublicWebUiUrl } from "@/lib/eliza-agent-web-ui";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { ElizaAgentPricingBanner } from "@/packages/ui/src/components/containers/eliza-agent-pricing-banner";
import { ElizaAgentsPageWrapper } from "@/packages/ui/src/components/containers/eliza-agents-page-wrapper";
import { ElizaAgentsTable } from "@/packages/ui/src/components/containers/eliza-agents-table";

export const metadata: Metadata = {
  title: "Instances",
  description: "View, launch, and manage your instances backed by Eliza Cloud.",
};

export default async function MiladyDashboardPage() {
  const user = await requireAuthWithOrg();

  // Milady sandboxes table may not exist in all environments — degrade gracefully
  let sandboxes: Awaited<ReturnType<typeof elizaSandboxService.listAgents>> = [];
  try {
    sandboxes = await elizaSandboxService.listAgents(user.organization_id);
  } catch {
    // Table likely missing — show empty list
  }

  // Compute canonical Web UI URLs server-side so the client table can link them.
  // Omit baseDomain when env is empty/whitespace so resolution falls through to default domain.
  const rawAgentBaseDomain = process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;
  const miladyPublicWebUiOptions =
    rawAgentBaseDomain !== undefined && rawAgentBaseDomain.trim() !== ""
      ? { baseDomain: rawAgentBaseDomain }
      : {};
  const sandboxesWithUrls = sandboxes.map((sandbox) => ({
    ...sandbox,
    canonical_web_ui_url: getElizaAgentPublicWebUiUrl(sandbox, miladyPublicWebUiOptions),
  }));

  // Count agents by status for pricing banner
  const runningCount = sandboxes.filter((s) => s.status === "running").length;
  const idleCount = sandboxes.filter(
    (s) => s.status === "stopped" || s.status === "disconnected",
  ).length;
  const creditBalance = Number(user.organization?.credit_balance ?? 0);

  return (
    <ElizaAgentsPageWrapper>
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 bg-[#FF5800]" />
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
              Instances
            </p>
          </div>
          <h1 className="text-xl font-semibold text-white md:text-2xl">Instances</h1>
        </div>

        <ElizaAgentPricingBanner
          runningCount={runningCount}
          idleCount={idleCount}
          creditBalance={creditBalance}
        />

        <Suspense fallback={<ContainersSkeleton />}>
          <ElizaAgentsTable sandboxes={sandboxesWithUrls} />
        </Suspense>
      </div>
    </ElizaAgentsPageWrapper>
  );
}
