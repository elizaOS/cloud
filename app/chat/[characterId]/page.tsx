import { redirect, notFound } from "next/navigation";
import { charactersService, anonymousSessionsService } from "@/lib/services";
import { getCurrentUser } from "@/lib/auth";
import { CharacterIntroPageWrapper } from "@/components/chat/character-intro-page-wrapper";
import { ChatPageClient } from "./chat-page-client";
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

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { characterId } = await params;
  const { source, session: sessionId, vibe, intro } = await searchParams;

  // 1. Load character from database
  const character = await charactersService.getById(characterId);

  if (!character) {
    logger.warn(`[Chat Page] Character not found: ${characterId}`);
    notFound();
  }

  // 2. Theme resolution for affiliate branding
  const characterData = character.character_data as Record<string, unknown> | undefined;
  const theme = resolveCharacterTheme(source, characterData);
  
  logger.debug(`[Chat Page] Resolved theme: ${theme.id} for character ${characterId}`);

  // 3. Check authentication status
  const user = await getCurrentUser();

  // 4. DECISION TREE: Show intro page or chat interface?

  // Case A: First-time visitor (no user, no session) OR explicitly requested intro
  if ((!user && !sessionId) || intro === "true") {
    logger.info(`[Chat Page] Showing intro page for character ${characterId}`);
    
    return (
      <CharacterIntroPageWrapper
        character={character}
        characterId={characterId}
        source={source}
        theme={theme}
        existingSessionId={sessionId} // Pass existing session if available
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

    const messagesRemaining = anonSession.messages_limit - anonSession.message_count;

    logger.info(`[Chat Page] Anonymous session: ${sessionId}`, {
      messageCount: anonSession.message_count,
      messagesRemaining,
    });

    return (
      <ChatPageClient
        character={character}
        sessionToken={sessionId}
        isAnonymous={true}
        messageCount={anonSession.message_count}
        messagesLimit={anonSession.messages_limit}
        source={source}
        theme={theme}
      />
    );
  }

  // Case C: Authenticated user
  logger.info(`[Chat Page] Authenticated user ${user!.id} accessing character ${characterId}`);

  return (
    <ChatPageClient
      character={character}
      isAnonymous={false}
      source={source}
      theme={theme}
    />
  );
}

// Generate metadata for SEO
export async function generateMetadata({ params, searchParams }: ChatPageProps) {
  const { characterId } = await params;
  const { source } = await searchParams;
  
  const character = await charactersService.getById(characterId);

  if (!character) {
    return {
      title: "Character Not Found",
    };
  }

  const characterData = character.character_data as Record<string, unknown> | undefined;
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


