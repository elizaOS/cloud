"use client";

import { useEffect, useState } from "react";
import { CharacterBuildMode } from "@/components/chat/character-build-mode";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/stores/chat-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";

interface BuildPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
}

export function BuildPageClient({
  initialCharacters,
  isAuthenticated,
}: BuildPageClientProps) {
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);

  // Initialize store with characters and entity ID
  const { setAvailableCharacters, initializeEntityId } = useChatStore();

  useSetPageHeader({
    title: "Build",
    description:
      "Build and customize AI agents using the ElizaOS runtime with intelligent assistance.",
  });

  // Initialize store on mount
  useEffect(() => {
    // Transform characters to match store interface
    const characters: Character[] = initialCharacters.map((char) => ({
      id: char.id || "",
      name: char.name || "Unknown",
      username: char.username || undefined,
      avatarUrl: char.avatarUrl || undefined,
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

      {/* Build Mode */}
      <div className="flex flex-1 overflow-hidden">
        <CharacterBuildMode initialCharacters={initialCharacters} />
      </div>
    </div>
  );
}
