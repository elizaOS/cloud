import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { MyAgentsClient } from "./my-agents";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.myAgents,
  path: "/dashboard/my-agents",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function MyAgentsPage() {
  await requireAuth();

  return <MyAgentsClient />;
}
