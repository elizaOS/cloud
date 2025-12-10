import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq, and } from "drizzle-orm";
import { generateCharacterMetadata } from "@/lib/seo";
import { CharacterDetailClient } from "./character-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPublicCharacter(id: string) {
  // Only return cloud-created public characters - app agents should never appear in marketplace
  const [character] = await db
    .select()
    .from(userCharacters)
    .where(
      and(
        eq(userCharacters.id, id),
        eq(userCharacters.is_public, true),
        eq(userCharacters.source, "cloud")
      )
    )
    .limit(1);

  return character;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const character = await getPublicCharacter(id);

  if (!character) {
    return {
      title: "Character Not Found",
      robots: { index: false, follow: false },
    };
  }

  const bio = Array.isArray(character.bio) ? character.bio[0] : character.bio;

  return generateCharacterMetadata(
    character.id,
    character.name,
    bio,
    character.avatar_url,
    character.tags || [],
  );
}

/**
 * Public character detail page for marketplace characters.
 * Displays character information and allows users to start chatting or clone the character.
 *
 * @param params - Route parameters containing the character ID.
 * @returns Character detail page component.
 */
export default async function CharacterPublicPage({ params }: PageProps) {
  const { id } = await params;
  const character = await getPublicCharacter(id);

  if (!character) {
    notFound();
  }

  return <CharacterDetailClient character={character} />;
}
