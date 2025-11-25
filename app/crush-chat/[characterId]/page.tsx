import { redirect, notFound } from "next/navigation";
import { charactersService, anonymousSessionsService } from "@/lib/services";
import { getCurrentUser } from "@/lib/auth";
import { CharacterIntroPageWrapperCrush } from "@/components/chat/character-intro-page-wrapper-crush";
import { ChatInterfaceCrush } from "@/components/chat/chat-interface-crush";
import { logger } from "@/lib/utils/logger";

interface CrushChatPageProps {
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

export default async function CrushChatPage({ params, searchParams }: CrushChatPageProps) {
  const { characterId } = await params;
  const { source, session: sessionId, vibe, intro } = await searchParams;

  // 1. Load character from database
  const character = await charactersService.getById(characterId);

  if (!character) {
    logger.warn(`[Crush Chat Page] Character not found: ${characterId}`);
    notFound();
  }

  // 2. Check authentication status
  const user = await getCurrentUser();

  // 3. DECISION TREE: Show intro page or chat interface?

  // Case A: First-time visitor (no user, no session) OR explicitly requested intro
  if ((!user && !sessionId) || intro === "true") {
    logger.info(`[Crush Chat Page] Showing intro page for character ${characterId}`);
    
    return (
      <CharacterIntroPageWrapperCrush
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
      logger.warn(`[Crush Chat Page] Invalid session token: ${sessionId}`);
      redirect(`/crush-chat/${characterId}?intro=true&source=${source || "clone-your-crush"}`);
    }

    // Check if session is expired
    if (anonSession.expires_at < new Date()) {
      logger.warn(`[Crush Chat Page] Expired session: ${sessionId}`);
      redirect(`/crush-chat/${characterId}?intro=true&source=${source || "clone-your-crush"}`);
    }

    // Check if they've hit the message limit
    const messagesRemaining = anonSession.messages_limit - anonSession.message_count;
    const shouldShowSignupPrompt = anonSession.message_count >= 5;

    logger.info(`[Crush Chat Page] Anonymous session: ${sessionId}`, {
      messageCount: anonSession.message_count,
      messagesRemaining,
      shouldShowSignupPrompt,
    });

    return (
      <ChatInterfaceCrush
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
      />
    );
  }

  // Case C: Authenticated user
  logger.info(`[Crush Chat Page] Authenticated user ${user!.id} accessing character ${characterId}`);

  if (source) {
    logger.info(`[Crush Chat Page] Affiliate traffic: ${source}`);
  }

  return (
    <ChatInterfaceCrush
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
export async function generateMetadata({ params }: CrushChatPageProps) {
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
    title: `Chat with ${character.name} | Clone Your Crush`,
    description: bioText.slice(0, 160),
    openGraph: {
      title: `Chat with ${character.name}`,
      description: bioText.slice(0, 160),
      images: character.avatar_url ? [character.avatar_url] : [],
    },
  };
}



