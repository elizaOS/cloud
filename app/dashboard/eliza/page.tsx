import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { ElizaPageClient } from "@/components/chat/eliza-page-client";
import { listCharacters } from "@/app/actions/characters";

export const metadata: Metadata = {
  title: "Eliza Agent",
  description:
    "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export default async function ElizaPage() {
  await requireAuth();

  // Load available characters for selection
  const characters = await listCharacters();

  return <ElizaPageClient initialCharacters={characters} />;
}
