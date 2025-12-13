import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { ElizaPageClient } from "@/components/chat/eliza-page-client";
import { listCharacters } from "@/app/actions/characters";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.eliza,
  path: "/dashboard/eliza",
  noIndex: true,
});

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function ElizaPage() {
  await requireAuth();

  // Load available characters for selection
  const characters = await listCharacters();

  return <ElizaPageClient initialCharacters={characters} />;
}
