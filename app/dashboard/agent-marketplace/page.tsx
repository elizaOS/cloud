import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { AgentMarketplaceClient } from "./agent-marketplace-client";

export const metadata: Metadata = {
  title: "Agent Marketplace",
  description:
    "Discover and explore AI agents from the community. Find templates, clone characters, and start conversations.",
};

export const dynamic = "force-dynamic";

export default async function AgentMarketplacePage() {
  await requireAuth();

  return <AgentMarketplaceClient />;
}
