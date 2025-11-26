"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CharacterIntroPage } from "./character-intro-page";
import type { UserCharacter } from "@/db/schemas";
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";

interface CharacterIntroPageWrapperProps {
  character: UserCharacter;
  characterId: string;
  source?: string;
  theme: AffiliateTheme;
  existingSessionId?: string;
}

export function CharacterIntroPageWrapper({
  character,
  characterId,
  source,
  theme,
  existingSessionId,
}: CharacterIntroPageWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleEmailSubmit(email: string) {
    // Privy handles the auth in the modal
    // After successful auth, redirect without intro parameter to show chat
    const params = new URLSearchParams();
    if (source) params.set("source", source);

    const queryString = params.toString();
    const newUrl = `/chat/${characterId}${queryString ? `?${queryString}` : ""}`;

    // Navigate to chat interface (authenticated users don't need session param)
    router.push(newUrl);
  }

  function handleSkip() {
    // Use existing session from URL if available (from affiliate API)
    // Otherwise use the one from props or create a new one
    const sessionFromUrl = searchParams.get("session");
    const sessionId = sessionFromUrl || existingSessionId || crypto.randomUUID();

    // Remove intro=true parameter to show chat interface
    // Always use /chat route - theming is dynamic based on source param
    router.push(`/chat/${characterId}?session=${sessionId}&source=${source || "direct"}`);
  }

  return (
    <CharacterIntroPage
      character={character}
      onEmailSubmit={handleEmailSubmit}
      onSkip={handleSkip}
      source={source}
      theme={theme}
    />
  );
}
