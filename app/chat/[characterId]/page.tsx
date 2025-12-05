import { redirect, notFound } from "next/navigation";
import { charactersService, anonymousSessionsService } from "@/lib/services";
import { getCurrentUser } from "@/lib/auth";
import { CharacterIntroPageWrapper } from "@/components/chat/character-intro-page-wrapper";
import { ChatInterface } from "@/components/chat/chat-interface";
import { logger } from "@/lib/utils/logger";
import { resolveCharacterTheme } from "@/lib/config/affiliate-themes";

interface ChatPageProps {
  params: Promise<{
    characterId: string;
  }>;
  searchParams: Promise<{
    source?: string;
    session?: string;
    vibe?: string;
    intro?: string;
  }>;
}

export default async function ChatPage({
  params,
  searchParams,
}: ChatPageProps) {
  const { characterId } = await params;
  const { source, session: sessionId, vibe, intro } = await searchParams;

  // 1. Load character from database
  const character = await charactersService.getById(characterId);

  if (!character) {
    logger.warn(`[Chat Page] Character not found: ${characterId}`);
    notFound();
  }

  // 2. DYNAMIC THEME RESOLUTION
  const characterData = character.character_data as
    | Record<string, unknown>
    | undefined;
  const theme = resolveCharacterTheme(source, characterData);

  logger.debug(
    `[Chat Page] Resolved theme: ${theme.id} for character ${characterId}`,
  );

  // 3. Check authentication status
  const user = await getCurrentUser();

  // 4. DECISION TREE: Show intro page or chat interface?

  // Case A: First-time visitor (no user, no session) OR explicitly requested intro
  if ((!user && !sessionId) || intro === "true") {
    logger.info(
      `[Chat Page] Showing intro page for character ${characterId} with theme ${theme.id}`,
    );

    return (
      <CharacterIntroPageWrapper
        character={character}
        characterId={characterId}
        source={source}
        theme={theme}
        existingSessionId={sessionId}
        isAuthenticated={!!user}
      />
    );
  }

  // Case B: Anonymous user with session token
  if (!user && sessionId) {
    const anonSession = await anonymousSessionsService.getByToken(sessionId);

    if (!anonSession) {
      logger.warn(`[Chat Page] Invalid session token: ${sessionId}`);
      redirect(`/chat/${characterId}?intro=true&source=${source || "direct"}`);
    }

    if (anonSession.expires_at < new Date()) {
      logger.warn(`[Chat Page] Expired session: ${sessionId}`);
      redirect(`/chat/${characterId}?intro=true&source=${source || "direct"}`);
    }

    const messagesRemaining =
      anonSession.messages_limit - anonSession.message_count;
    const shouldShowSignupPrompt = anonSession.message_count >= 5;

    logger.info(
      `[Chat Page] Anonymous session: ${sessionId} with theme ${theme.id}`,
      {
        messageCount: anonSession.message_count,
        messagesRemaining,
      },
    );

    return (
      <ChatInterface
        character={character}
        session={{
          id: anonSession.id,
          token: sessionId,
          userId: anonSession.user_id,
          messageCount: anonSession.message_count,
          messagesLimit: anonSession.messages_limit,
          messagesRemaining,
        }}
        showSignupPrompt={shouldShowSignupPrompt}
        source={source}
        sessionTokenFromUrl={sessionId}
        theme={theme}
      />
    );
  }

  // Case C: Authenticated user
  logger.info(
    `[Chat Page] Authenticated user ${user!.id} accessing character ${characterId} with theme ${theme.id}`,
  );

  // CRITICAL: If authenticated user has a session token in URL, migrate the anonymous session data
  // This handles the case where user was already authenticated when redirected from affiliate
  if (sessionId && user!.privy_user_id) {
    logger.info(`[Chat Page] Authenticated user with session token - triggering server-side migration`, {
      sessionId,
      userId: user!.id,
      privyUserId: user!.privy_user_id,
    });

    try {
      const anonSession = await anonymousSessionsService.getByToken(sessionId);

      if (anonSession && !anonSession.converted_at) {
        logger.info(`[Chat Page] Found unconverted anonymous session, migrating...`, {
          sessionId: anonSession.id,
          anonymousUserId: anonSession.user_id,
        });

        const { convertAnonymousToReal } = await import("@/lib/auth-anonymous");
        await convertAnonymousToReal(anonSession.user_id, user!.privy_user_id);

        logger.info(`[Chat Page] Migration completed successfully`);
      } else if (anonSession?.converted_at) {
        logger.info(`[Chat Page] Session already converted`, { sessionId });
      } else {
        logger.warn(`[Chat Page] Session not found for token`, { sessionId: sessionId.slice(0, 8) + "..." });
      }
    } catch (error) {
      logger.error(`[Chat Page] Migration failed:`, error);
    }
  }

  // CLAIM AFFILIATE CHARACTER
  // If this is an affiliate-created character owned by an anonymous user,
  // automatically transfer ownership to the authenticated user
  if (user!.organization_id) {
    const claimCheck = await charactersService.isClaimableAffiliateCharacter(characterId);

    if (claimCheck.claimable) {
      logger.info(`[Chat Page] 🎯 Detected claimable affiliate character, initiating transfer...`, {
        characterId,
        userId: user!.id,
        previousOwnerId: claimCheck.ownerId,
      });

      const claimResult = await charactersService.claimAffiliateCharacter(
        characterId,
        user!.id,
        user!.organization_id
      );

      if (claimResult.success) {
        logger.info(`[Chat Page] ✅ Successfully claimed affiliate character: ${characterId}`);
        // Reload the character to get updated ownership
        const updatedCharacter = await charactersService.getById(characterId);
        if (updatedCharacter) {
          return (
            <ChatInterface
              character={updatedCharacter}
              user={{
                id: user!.id,
                name: user!.name || undefined,
                email: user!.email || undefined,
              }}
              source={source}
              theme={theme}
            />
          );
        }
      } else {
        logger.warn(`[Chat Page] Failed to claim affiliate character: ${claimResult.message}`);
      }
    }
  }

  return (
    <ChatInterface
      character={character}
      user={{
        id: user!.id,
        name: user!.name || undefined,
        email: user!.email || undefined,
      }}
      source={source}
      theme={theme}
    />
  );
}

// Generate metadata for SEO with theme-aware branding
export async function generateMetadata({
  params,
  searchParams,
}: ChatPageProps) {
  const { characterId } = await params;
  const { source } = await searchParams;

  const character = await charactersService.getById(characterId);

  if (!character) {
    return {
      title: "Character Not Found",
    };
  }

  const characterData = character.character_data as
    | Record<string, unknown>
    | undefined;
  const theme = resolveCharacterTheme(source, characterData);

  const bioText = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;

  return {
    title: `Chat with ${character.name} | ${theme.branding.title}`,
    description: bioText.slice(0, 160),
    openGraph: {
      title: `Chat with ${character.name}`,
      description: bioText.slice(0, 160),
      images: character.avatar_url ? [character.avatar_url] : [],
    },
  };
}
