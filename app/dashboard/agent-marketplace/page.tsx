import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { AgentMarketplaceClient } from "./agent-marketplace-client";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.agentMarketplace,
  path: "/dashboard/agent-marketplace",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function AgentMarketplacePage() {
  await requireAuth();

  return <AgentMarketplaceClient />;
}
