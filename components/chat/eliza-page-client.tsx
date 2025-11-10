"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { CharacterBuildMode } from "@/components/chat/character-build-mode";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/stores/chat-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
}

export function ElizaPageClient({
  initialCharacters,
  isAuthenticated,
}: ElizaPageClientProps) {
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);
  const searchParams = useSearchParams();
  const [initialCharacterId, setInitialCharacterId] = useState<string | null>(
    null,
  );

  // Initialize store with characters and entity ID (must be at top level)
  const { setAvailableCharacters, initializeEntityId, mode } = useChatStore();

  // Note: Page header is now handled by ChatHeader component
  // Remove this if you want to completely disable the old header system for chat
  useSetPageHeader({
    title: "Chat",
    description:
      "Chat with AI agents using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  // Initialize store on mount
  useEffect(() => {
    // Transform characters to match store interface
    const characters: Character[] = initialCharacters.map((char) => ({
      id: char.id || "",
      name: char.name || "Unknown",
      username: char.username || undefined,
    }));

    setAvailableCharacters(characters);
    initializeEntityId();
  }, [initialCharacters, setAvailableCharacters, initializeEntityId]);

  // Initialize anonymous session for unauthenticated users
  useEffect(() => {
    if (!isAuthenticated && !anonymousSession) {
      getOrCreateAnonymousUserAction()
        .then((result) => {
          if (result.session) {
            setAnonymousSession({
              messageCount: result.session.message_count,
              messagesLimit: result.session.messages_limit,
              remainingMessages:
                result.session.messages_limit - result.session.message_count,
            });
          }
          setIsLoadingSession(false);
        })
        .catch((error) => {
          console.error("Failed to create anonymous session:", error);
          setIsLoadingSession(false);
        });
    }
  }, [isAuthenticated, anonymousSession]);

  useEffect(() => {
    const characterId = searchParams.get("characterId");
    if (characterId) {
      console.log("[Chat Page] Character ID from URL:", characterId);
      // Set character ID asynchronously to avoid cascading renders
      Promise.resolve().then(() => {
        setInitialCharacterId(characterId);
      });
    }
  }, [searchParams]);

  // Show loading state while initializing anonymous session
  if (!isAuthenticated && isLoadingSession) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Signup prompt banner for anonymous users */}
      {!isAuthenticated && anonymousSession && (
        <SignupPromptBanner
          messageCount={anonymousSession.messageCount}
          messagesLimit={anonymousSession.messagesLimit}
        />
      )}

      {/* Conditional rendering based on mode */}
      <div className="flex flex-1 overflow-hidden">
        {mode === "build" ? (
          <CharacterBuildMode initialCharacters={initialCharacters} />
        ) : (
          <ElizaChatInterface initialCharacterId={initialCharacterId} />
        )}
      </div>
    </div>
  );
}
