import type { Metadata } from "next";
import { cookies } from "next/headers";
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
import { logger } from "@/lib/utils/logger";

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

  // Server-side migration check: if user has an anonymous session cookie, migrate it
  if (user?.privy_user_id) {
    try {
      const cookieStore = await cookies();
      const anonSessionCookie = cookieStore.get("eliza-anon-session");

      if (anonSessionCookie?.value) {
        logger.info("[Dashboard Chat] Found anonymous session cookie, attempting migration", {
          userId: user.id,
          sessionToken: anonSessionCookie.value.slice(0, 8) + "...",
        });

        const { anonymousSessionsService } = await import("@/lib/services");
        const anonSession = await anonymousSessionsService.getByToken(anonSessionCookie.value);

        if (anonSession && !anonSession.converted_at) {
          logger.info("[Dashboard Chat] Found unconverted session, migrating...", {
            sessionId: anonSession.id,
            anonymousUserId: anonSession.user_id,
          });

          const { convertAnonymousToReal } = await import("@/lib/auth-anonymous");
          await convertAnonymousToReal(anonSession.user_id, user.privy_user_id);

          logger.info("[Dashboard Chat] Migration completed successfully");
        }
      }
    } catch (error) {
      logger.error("[Dashboard Chat] Migration check failed:", error);
    }
  }

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
