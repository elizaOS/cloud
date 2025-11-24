import { redirect, notFound } from "next/navigation";
import { charactersService, anonymousSessionsService } from "@/lib/services";
import { getCurrentUser } from "@/lib/auth";
import { CharacterIntroPageWrapper } from "@/components/chat/character-intro-page-wrapper";
import { ChatInterface } from "@/components/chat/chat-interface";
import { logger } from "@/lib/utils/logger";

interface ChatPageProps {
  params: Promise<{
    characterId: string;
  }>;
  searchParams: Promise<{
    source?: string;
    session?: string;
    vibe?: string;
    intro?: string; // If "true", show intro page
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

  // 2. Check authentication status
  const user = await getCurrentUser();

  // 3. DECISION TREE: Show intro page or chat interface?

  // Case A: First-time visitor (no user, no session) OR explicitly requested intro
  if ((!user && !sessionId) || intro === "true") {
    logger.info(`[Chat Page] Showing intro page for character ${characterId}`);
    
    return (
      <CharacterIntroPageWrapper
        character={character}
        characterId={characterId}
        source={source}
      />
    );
  }

  // Case B: Anonymous user with session token
  if (!user && sessionId) {
    const anonSession = await anonymousSessionsService.getByToken(sessionId);

    if (!anonSession) {
      logger.warn(`[Chat Page] Invalid session token: ${sessionId}`);
      // Redirect to intro page to create new session
      redirect(`/chat/${characterId}?intro=true&source=${source || "direct"}`);
    }

    // Check if session is expired
    if (anonSession.expires_at < new Date()) {
      logger.warn(`[Chat Page] Expired session: ${sessionId}`);
      redirect(`/chat/${characterId}?intro=true&source=${source || "direct"}`);
    }

    // Check if they've hit the message limit
    const messagesRemaining = anonSession.messages_limit - anonSession.message_count;
    const shouldShowSignupPrompt = anonSession.message_count >= 5; // Show after 5 messages

    logger.info(`[Chat Page] Anonymous session: ${sessionId}`, {
      messageCount: anonSession.message_count,
      messagesRemaining,
      shouldShowSignupPrompt,
    });

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
        sessionTokenFromUrl={sessionId} // Pass session token to set cookie
      />
    );
  }

  // Case C: Authenticated user
  logger.info(`[Chat Page] Authenticated user ${user!.id} accessing character ${characterId}`);

  // Track analytics if from affiliate
  if (source) {
    logger.info(`[Chat Page] Affiliate traffic: ${source}`);
    // TODO: Add analytics tracking
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
    />
  );
}

// Generate metadata for SEO
export async function generateMetadata({ params }: ChatPageProps) {
  const { characterId } = await params;
  const character = await charactersService.getById(characterId);

  if (!character) {
    return {
      title: "Character Not Found",
    };
  }

  const bioText = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;

  return {
    title: `Chat with ${character.name} | ElizaOS Cloud`,
    description: bioText.slice(0, 160),
    openGraph: {
      title: `Chat with ${character.name}`,
      description: bioText.slice(0, 160),
      images: character.avatar_url ? [character.avatar_url] : [],
    },
  };
}

