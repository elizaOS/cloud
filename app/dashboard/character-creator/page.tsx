import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listCharacters } from "@/app/actions/characters";
import { CharacterCreatorClient } from "@/components/character-creator/character-creator-client";

export const metadata: Metadata = {
  title: "Character Creator",
  description:
    "Create and customize AI agent characters with personality, knowledge, and style",
};

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = 'force-dynamic';

export default async function CharacterCreatorPage() {
  await requireAuth();
  const characters = await listCharacters();

  return (
    <div className="h-full">
      <CharacterCreatorClient initialCharacters={characters} />
    </div>
  );
}
