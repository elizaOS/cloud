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
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

/**
 * Character Creator page for creating and customizing AI agent characters.
 * Supports editing existing characters via the `id` search parameter.
 *
 * @param searchParams - Search parameters, including optional character `id` for editing.
 * @returns The rendered character creator page client component.
 */
export default async function CharacterCreatorPage({
  searchParams,
}: PageProps) {
  const user = await requireAuth();
  const characters = await listCharacters();
  const params = await searchParams;
  const characterId = params.id;

  return (
    <div className="h-full">
      <CharacterCreatorClient
        initialCharacters={characters}
        initialCharacterId={characterId}
        userId={user.id}
      />
    </div>
  );
}
