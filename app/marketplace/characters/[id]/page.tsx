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
  try {
    const [character] = await db
      .select()
      .from(userCharacters)
      .where(and(eq(userCharacters.id, id), eq(userCharacters.is_public, true)))
      .limit(1);

    return character;
  } catch (error) {
    console.error("Error fetching public character:", error);
    return null;
  }
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

export default async function CharacterPublicPage({ params }: PageProps) {
  const { id } = await params;
  const character = await getPublicCharacter(id);

  if (!character) {
    notFound();
  }

  return <CharacterDetailClient character={character} />;
}
