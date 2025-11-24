"use client";

import { useRouter } from "next/navigation";
import { CharacterIntroPage } from "./character-intro-page";
import type { UserCharacter } from "@/db/schemas";

interface CharacterIntroPageWrapperProps {
  character: UserCharacter;
  characterId: string;
  source?: string;
}

export function CharacterIntroPageWrapper({
  character,
  characterId,
  source,
}: CharacterIntroPageWrapperProps) {
  const router = useRouter();

  async function handleEmailSubmit(email: string) {
    // Privy handles the auth in the modal
    // After successful auth, user will be redirected back with auth token
    // The page will reload and detect authenticated user
    router.refresh();
  }

  function handleSkip() {
    // Create new session ID and redirect to chat with anonymous session
    const newSessionId = crypto.randomUUID();
    router.push(`/chat/${characterId}?session=${newSessionId}&source=${source || "direct"}`);
  }

  return (
    <CharacterIntroPage
      character={character}
      onEmailSubmit={handleEmailSubmit}
      onSkip={handleSkip}
      source={source}
    />
  );
}

