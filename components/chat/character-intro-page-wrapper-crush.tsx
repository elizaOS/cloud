"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CharacterIntroPageCrush } from "./character-intro-page-crush";
import type { UserCharacter } from "@/db/schemas";

interface CharacterIntroPageWrapperCrushProps {
  character: UserCharacter;
  characterId: string;
  source?: string;
}

export function CharacterIntroPageWrapperCrush({
  character,
  characterId,
  source,
}: CharacterIntroPageWrapperCrushProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleEmailSubmit(email: string) {
    // Privy handles the auth in the modal
    // After successful auth, redirect without intro parameter to show chat
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    
    const queryString = params.toString();
    const newUrl = `/crush-chat/${characterId}${queryString ? `?${queryString}` : ""}`;
    
    // Navigate to chat interface (authenticated users don't need session param)
    router.push(newUrl);
  }

  function handleSkip() {
    // Use existing session from URL if available (from affiliate API)
    // Otherwise create a new one
    const existingSession = searchParams.get("session");
    const sessionId = existingSession || crypto.randomUUID();
    
    // Remove intro=true parameter to show chat interface
    router.push(`/crush-chat/${characterId}?session=${sessionId}&source=${source || "clone-your-crush"}`);
  }

  return (
    <CharacterIntroPageCrush
      character={character}
      onEmailSubmit={handleEmailSubmit}
      onSkip={handleSkip}
      source={source}
    />
  );
}



