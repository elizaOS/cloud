import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { ElizaPageClient } from "@/components/chat/eliza-page-client";
import { listCharacters } from "@/app/actions/characters";
import {
  generatePageMetadata,
  generateCharacterMetadata,
  ROUTE_METADATA,
} from "@/lib/seo";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq } from "drizzle-orm";

interface PageProps {
  searchParams: Promise<{ characterId?: string; roomId?: string }>;
}

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const characterId = params.characterId;

  // If no characterId, use default metadata
  if (!characterId) {
    return generatePageMetadata({
      ...ROUTE_METADATA.eliza,
      path: "/dashboard/chat",
      noIndex: true,
    });
  }

  // Fetch character for dynamic metadata
  try {
    const [character] = await db
      .select()
      .from(userCharacters)
      .where(eq(userCharacters.id, characterId))
      .limit(1);

    if (character) {
      const bio = Array.isArray(character.bio)
        ? character.bio[0]
        : character.bio;
      const metadata = generateCharacterMetadata(
        character.id,
        character.name,
        bio,
        character.avatar_url,
        character.tags || [],
      );

      // Override path and add noIndex for dashboard pages
      return {
        ...metadata,
        alternates: {
          canonical: `/dashboard/chat?characterId=${characterId}`,
        },
        robots: {
          index: false,
          follow: false,
        },
      };
    }
  } catch (error) {
    console.error("Error fetching character for metadata:", error);
  }

  // Fallback to default metadata
  return generatePageMetadata({
    ...ROUTE_METADATA.eliza,
    path: "/dashboard/chat",
    noIndex: true,
  });
}

export default async function ElizaPage({ searchParams }: PageProps) {
  // Check if user is authenticated (don't create anonymous here - let client handle it)
  const user = await getCurrentUser();
  const isAnonymous = !user;

  // Load available characters for authenticated users only
  const characters = isAnonymous ? [] : await listCharacters();

  // Get URL params
  const params = await searchParams;
  const initialRoomId = params.roomId;
  const initialCharacterId = params.characterId;

  return (
    <ElizaPageClient
      initialCharacters={characters}
      isAuthenticated={!isAnonymous}
      initialRoomId={initialRoomId}
      initialCharacterId={initialCharacterId}
    />
  );
}
