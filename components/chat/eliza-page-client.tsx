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

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/lib/stores/chat-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";
import { toast } from "sonner";

interface SharedCharacter {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string;
}

interface AccessError {
  type: string;
  characterName?: string;
}

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
  initialRoomId?: string;
  initialCharacterId?: string;
  /** Pre-loaded character data for shared links (when character is not owned by user) */
  sharedCharacter?: SharedCharacter | null;
  /** Access error when trying to load a private character */
  accessError?: AccessError;
}

export function ElizaPageClient({
  initialCharacters,
  isAuthenticated,
  initialRoomId,
  initialCharacterId,
  sharedCharacter,
  accessError,
}: ElizaPageClientProps) {
  const router = useRouter();
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);
  const errorShownRef = useRef(false);

  // Initialize store with characters (must be at top level)
  const {
    setAvailableCharacters,
    setRoomId,
    setSelectedCharacterId,
    selectedCharacterId,
  } = useChatStore();

  // Show access error toast when redirected from private character
  useEffect(() => {
    if (accessError && !errorShownRef.current) {
      errorShownRef.current = true;

      if (accessError.type === "private_character") {
        const characterName = accessError.characterName || "This agent";
        toast.error(`Sorry, "${characterName}" is not your agent`, {
          description:
            "This agent is private. Only the owner can chat with it. Ask the owner to make it public if you'd like to chat.",
          duration: 6000,
        });
      } else {
        toast.error("Access denied", {
          description: "You don't have permission to access this agent.",
          duration: 5000,
        });
      }

      // Clear error AND characterId from URL without navigation
      // This prevents the URL from showing a characterId that the user can't access
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        url.searchParams.delete("name");
        url.searchParams.delete("characterId"); // Also clear the inaccessible characterId
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [accessError]);

  // Redirect authenticated users without a selected character to the build page
  // Chat mode requires an agent - "Create New Agent" mode is only available in build mode
  useEffect(() => {
    if (!isAuthenticated) return;

    // If no character is selected and no initial character ID provided,
    // redirect to build page - chat requires an existing agent
    if (
      !selectedCharacterId &&
      !initialCharacterId &&
      initialCharacters.length === 0
    ) {
      router.replace("/dashboard/build");
    }
  }, [
    isAuthenticated,
    selectedCharacterId,
    initialCharacterId,
    initialCharacters.length,
    router,
  ]);

  // Note: Page header is now handled by ChatHeader component
  // Remove this if you want to completely disable the old header system for chat
  useSetPageHeader({
    title: "Chat",
    description:
      "Chat with AI agents using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  // Memoize transformed characters to prevent unnecessary re-renders
  // Include shared character data for shared links (when character is not owned by user)
  const characters = useMemo<Character[]>(() => {
    const chars = initialCharacters.map((char) => ({
      id: char.id || "",
      name: char.name || "Unknown",
      username: char.username || undefined,
      avatarUrl: char.avatarUrl || char.avatar_url || undefined,
    }));

    // Add shared character if provided and not already in the list
    if (sharedCharacter && !chars.some((c) => c.id === sharedCharacter.id)) {
      chars.push({
        id: sharedCharacter.id,
        name: sharedCharacter.name,
        username: sharedCharacter.username || undefined,
        avatarUrl: sharedCharacter.avatarUrl || undefined,
      });
    }

    return chars;
  }, [initialCharacters, sharedCharacter]);

  // Initialize store on mount (only when characters change)
  useEffect(() => {
    setAvailableCharacters(characters);
  }, [characters, setAvailableCharacters]);

  // Sync URL params with store - run on mount and when params change
  // This ensures the store reflects URL changes (e.g., navigating to a different characterId)
  useEffect(() => {
    // If we have a characterId from URL but no roomId, clear the stored roomId
    // This ensures a fresh room is created for the new character
    // (e.g., after creating a character in build mode and redirecting to chat)
    if (initialCharacterId && !initialRoomId) {
      setRoomId(null);
    } else if (initialRoomId) {
      setRoomId(initialRoomId);
    }

    if (initialCharacterId) {
      setSelectedCharacterId(initialCharacterId);
    }
  }, [initialCharacterId, initialRoomId, setRoomId, setSelectedCharacterId]);

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
        <ElizaChatInterface expectedCharacterId={initialCharacterId} />
      </div>
    </div>
  );
}
