/**
 * Eliza page client component for the main chat interface.
 * Initializes chat store, handles anonymous sessions, and displays chat interface with signup prompts.
 *
 * @param props - Eliza page client configuration
 * @param props.initialCharacters - Initial list of characters
 * @param props.isAuthenticated - Whether user is authenticated
 * @param props.initialRoomId - Optional initial room ID
 * @param props.initialCharacterId - Optional initial character ID
 */

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/stores/chat-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
  initialRoomId?: string;
  initialCharacterId?: string;
}

export function ElizaPageClient({
  initialCharacters,
  isAuthenticated,
  initialRoomId,
  initialCharacterId,
}: ElizaPageClientProps) {
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);

  // Initialize store with characters (must be at top level)
  const { setAvailableCharacters, setRoomId, setSelectedCharacterId } =
    useChatStore();

  // Note: Page header is now handled by ChatHeader component
  // Remove this if you want to completely disable the old header system for chat
  useSetPageHeader({
    title: "Chat",
    description:
      "Chat with AI agents using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  // Memoize transformed characters to prevent unnecessary re-renders
  const characters = useMemo<Character[]>(
    () =>
      initialCharacters.map((char) => ({
        id: char.id || "",
        name: char.name || "Unknown",
        username: char.username || undefined,
        avatarUrl: char.avatarUrl || char.avatar_url || undefined,
      })),
    [initialCharacters],
  );

  // Initialize store on mount (only when characters change)
  useEffect(() => {
    setAvailableCharacters(characters);
  }, [characters, setAvailableCharacters]);

  // Sync URL params with store on mount (only once)
  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
    }
    if (initialCharacterId) {
      setSelectedCharacterId(initialCharacterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Initialize anonymous session for unauthenticated users (only once)
  useEffect(() => {
    if (!isAuthenticated && !anonymousSession && isLoadingSession) {
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
        .catch(() => {
          setIsLoadingSession(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

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

      {/* Chat Interface */}
      <div className="flex flex-1 overflow-hidden">
        <ElizaChatInterface />
      </div>
    </div>
  );
}
