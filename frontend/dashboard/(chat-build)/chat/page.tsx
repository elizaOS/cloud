import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { listCharacters } from "@/app/actions/characters";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { users } from "@/db/schemas/users";
import { getCurrentUser } from "@/lib/auth";
import { generateCharacterMetadata, generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { charactersService } from "@/lib/services/characters/characters";
import { migrateAnonymousSession } from "@/lib/session";
import { logger } from "@/lib/utils/logger";
import { sanitizeUUID } from "@/lib/utils/validation";
import { ElizaPageClient } from "@/packages/ui/src/components/chat/eliza-page-client";

interface PageProps {
  searchParams: Promise<{
    characterId?: string;
    roomId?: string;
    error?: string;
    name?: string;
  }>;
}

// Force dynamic rendering since we use server-side auth (cookies)
export const dynamic = "force-dynamic";
const CHARACTER_LOOKUP_TIMEOUT_MS = 1500;

function withLookupTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        `[Dashboard Chat] ${label} timed out after ${CHARACTER_LOOKUP_TIMEOUT_MS}ms`,
      );
      logger.error(error.message);
      reject(error);
    }, CHARACTER_LOOKUP_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Generates metadata for the chat page, optionally including character-specific metadata.
 *
 * @param searchParams - Search parameters, including optional `characterId` for character-specific metadata.
 * @returns Metadata object with title and description for the chat page or character chat.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  // Sanitize UUID to handle malformed input (e.g., trailing backslashes from URL encoding)
  const characterId = sanitizeUUID(params.characterId);

  // If no characterId or invalid UUID, use default metadata
  if (!characterId) {
    return generatePageMetadata({
      ...ROUTE_METADATA.eliza,
      path: "/dashboard/chat",
      noIndex: true,
    });
  }

  // Fetch character for dynamic metadata
  let character: typeof userCharacters.$inferSelect | undefined;
  try {
    [character] = await withLookupTimeout(
      db.select().from(userCharacters).where(eq(userCharacters.id, characterId)).limit(1),
      "metadata character lookup",
    );
  } catch (error) {
    logger.error(`[Dashboard Chat] Metadata lookup failed for ${characterId}`, error);
  }

  if (character) {
    const bio = Array.isArray(character.bio) ? character.bio[0] : character.bio;
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

  // Fallback to default metadata
  return generatePageMetadata({
    ...ROUTE_METADATA.eliza,
    path: "/dashboard/chat",
    noIndex: true,
  });
}

/**
 * Eliza chat page for interacting with AI agents/characters.
 * Handles server-side migration of anonymous session data to authenticated user.
 * Supports both authenticated and anonymous users.
 *
 * @param searchParams - Search parameters, including optional `characterId` and `roomId`.
 * @returns The rendered Eliza chat page client component with initial characters and room/character IDs.
 */
export default async function ElizaPage({ searchParams }: PageProps) {
  // Check if user is authenticated (don't create anonymous here - let client handle it)
  const user = await getCurrentUser();
  const isAnonymous = !user;

  // Server-side migration check: if user has an anonymous session cookie, migrate it
  if (user?.privy_user_id) {
    const cookieStore = await cookies();
    const anonSessionCookie = cookieStore.get("eliza-anon-session");

    if (anonSessionCookie?.value) {
      logger.info("[Dashboard Chat] Found anonymous session cookie, attempting migration", {
        userId: user.id,
        sessionToken: anonSessionCookie.value.slice(0, 8) + "...",
      });

      const anonSession = await anonymousSessionsService.getByToken(anonSessionCookie.value);

      if (anonSession && !anonSession.converted_at) {
        logger.info("[Dashboard Chat] Found unconverted session, migrating...", {
          sessionId: anonSession.id,
          anonymousUserId: anonSession.user_id,
        });

        await migrateAnonymousSession(anonSession.user_id, user.privy_user_id);

        logger.info("[Dashboard Chat] Migration completed successfully");
      }
    }
  }

  // Load available characters for authenticated users only
  const characters = isAnonymous ? [] : await listCharacters();

  // Get URL params - sanitize UUIDs to handle malformed input
  const params = (await searchParams) ?? {};
  const initialRoomId = sanitizeUUID(params.roomId);
  let initialCharacterId = sanitizeUUID(params.characterId);
  let errorType = params.error;
  let errorCharacterName = params.name;

  // For shared character links, fetch the character data server-side
  // This ensures the character info is available immediately on page load
  let sharedCharacter: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    bio?: string;
    ownerId?: string;
    creatorUsername?: string | null;
  } | null = null;

  // Track if the current user owns the selected character
  let isOwnerOfSelectedCharacter = false;

  // ACCESS CONTROL: Check if user can access the character before loading
  if (initialCharacterId && !errorType) {
    // Check if character is already in user's list (user owns it)
    const isOwnCharacter = characters.some((c) => c.id === initialCharacterId);

    if (isOwnCharacter) {
      // User owns this character
      isOwnerOfSelectedCharacter = true;
    } else {
      // Fetch character data to check access
      try {
        const character = await withLookupTimeout(
          charactersService.getById(initialCharacterId),
          "character access lookup",
        );

        if (!character || character.source !== "cloud") {
          // Character doesn't exist or wrong source - clear characterId
          logger.warn(
            `[Dashboard Chat] Character ${initialCharacterId} not found or invalid source`,
          );
          initialCharacterId = undefined;
        } else {
          const isOwner = user && character.user_id === user.id;
          const isPublic = character.is_public === true;

          // Check if this is a claimable affiliate character
          const claimCheck = await charactersService.isClaimableAffiliateCharacter(character.id);
          const isClaimableAffiliate = claimCheck.claimable;

          if (isPublic || isOwner || isClaimableAffiliate) {
            // Access granted - load the shared character
            isOwnerOfSelectedCharacter = !!isOwner;

            // Fetch creator info for attribution
            let creatorUsername: string | null = null;
            if (character.user_id && !isOwner) {
              try {
                const ownerUser = await db
                  .select({
                    nickname: users.nickname,
                    telegramUsername: users.telegram_username,
                  })
                  .from(users)
                  .where(eq(users.id, character.user_id))
                  .limit(1);
                const ownerRecord = ownerUser[0];
                creatorUsername = ownerRecord?.nickname || ownerRecord?.telegramUsername || null;
              } catch {
                // Ignore errors fetching creator username
              }
            }

            sharedCharacter = {
              id: character.id,
              name: character.name,
              username: character.username,
              avatarUrl: character.avatar_url,
              bio: Array.isArray(character.bio) ? character.bio[0] : character.bio,
              ownerId: character.user_id,
              creatorUsername,
            };
            logger.debug(
              `[Dashboard Chat] Loaded shared character: ${character.name} (${character.id})`,
              { isPublic, isOwner, isClaimableAffiliate },
            );
          } else {
            // ACCESS DENIED - character is private and not owned by user
            logger.warn(
              `[Dashboard Chat] Access denied to private character: ${initialCharacterId}`,
              {
                userId: user?.id,
                characterOwnerId: character.user_id,
                isPublic: character.is_public,
              },
            );
            // Set error state instead of loading the character
            errorType = "private_character";
            errorCharacterName = character.name;
            initialCharacterId = undefined;
          }
        }
      } catch (error) {
        logger.error(`[Dashboard Chat] Failed to load character ${initialCharacterId}:`, error);
        errorType = "character_unavailable";
        initialCharacterId = undefined;
      }
    }
  }

  return (
    <ElizaPageClient
      initialCharacters={characters}
      isAuthenticated={!isAnonymous}
      userId={user?.id || null}
      initialRoomId={initialRoomId}
      initialCharacterId={initialCharacterId}
      sharedCharacter={sharedCharacter}
      isOwnerOfSelectedCharacter={isOwnerOfSelectedCharacter}
      accessError={errorType ? { type: errorType, characterName: errorCharacterName } : undefined}
    />
  );
}
