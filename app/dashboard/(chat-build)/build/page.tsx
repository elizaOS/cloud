import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { BuildPageClient } from "@/components/chat/build-page-client";
import { listCharacters } from "@/app/actions/characters";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    ...ROUTE_METADATA.eliza,
    path: "/dashboard/build",
    noIndex: true,
  });
}

export default async function BuildPage() {
  // Check if user is authenticated
  const user = await getCurrentUser();
  const isAnonymous = !user;

  // Load available characters for authenticated users only
  const characters = isAnonymous ? [] : await listCharacters();

  return (
    <BuildPageClient
      initialCharacters={characters}
      isAuthenticated={!isAnonymous}
    />
  );
}
