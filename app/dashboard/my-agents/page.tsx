import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listCharacters } from "@/app/actions/characters";
import { MyAgentsClient } from "@/components/my-agents/my-agents-client";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.myAgents,
  path: "/dashboard/my-agents",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function MyAgentsPage() {
  await requireAuth();
  const characters = await listCharacters();

  return <MyAgentsClient initialCharacters={characters} />;
}
