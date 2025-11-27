"use client";

import { useState } from "react";
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
  isAuthenticated?: boolean;
}

export function CharacterIntroPageWrapper({
  character,
  characterId,
  source,
  theme,
  existingSessionId,
  isAuthenticated = false,
}: CharacterIntroPageWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // For authenticated users, go directly to chat (no session needed)
  async function handleAuthenticatedStart() {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    const queryString = params.toString();
    router.push(`/chat/${characterId}${queryString ? `?${queryString}` : ""}`);
  }

  async function handleEmailSubmit(email: string) {
    const params = new URLSearchParams();
    if (source) params.set("source", source);

    const queryString = params.toString();
    const newUrl = `/chat/${characterId}${queryString ? `?${queryString}` : ""}`;

    router.push(newUrl);
  }

  async function handleSkip() {
    // Use existing session from URL or props if available
    const sessionFromUrl = searchParams.get("session");
    let sessionId = sessionFromUrl || existingSessionId;

    // If no existing session, CREATE one in the database
    if (!sessionId) {
      setIsCreatingSession(true);
      try {
        const response = await fetch("/api/affiliate/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            characterId,
            source: source || "direct",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          sessionId = data.sessionToken;
        } else {
          // Fallback: generate UUID (won't have message tracking)
          sessionId = crypto.randomUUID();
        }
      } catch (error) {
        console.error("Failed to create session:", error);
        sessionId = crypto.randomUUID();
      } finally {
        setIsCreatingSession(false);
      }
    }

    // Navigate to chat with session
    router.push(`/chat/${characterId}?session=${sessionId}&source=${source || "direct"}`);
  }

  return (
    <CharacterIntroPage
      character={character}
      onEmailSubmit={handleEmailSubmit}
      onSkip={handleSkip}
      onAuthenticatedStart={handleAuthenticatedStart}
      source={source}
      theme={theme}
      isLoading={isCreatingSession}
      isAuthenticated={isAuthenticated}
    />
  );
}
