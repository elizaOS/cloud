"use client";

import { useEffect, useState } from "react";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { ChatHeader } from "@/components/chat/chat-header";
import { SessionsSidebar } from "@/components/chat/sessions-sidebar";
import { AgentDNAPanel } from "@/components/chat/agent-dna-panel";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/stores/chat-store";
import { useModeStore } from "@/stores/mode-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
  initialRoomId?: string;
  initialCharacterId?: string;
  initialMode?: "chat" | "build";
}

export function ElizaPageClient({
  initialCharacters,
  isAuthenticated,
  initialRoomId,
  initialCharacterId,
  initialMode = "chat",
}: ElizaPageClientProps) {
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);

  // Initialize store with characters and entity ID (must be at top level)
  const {
    setAvailableCharacters,
    initializeEntityId,
    setRoomId,
    setSelectedCharacterId,
  } = useChatStore();
  
  // Mode store - Must be called at top level before any early returns
  const { setMode, mode } = useModeStore();

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

  // Sync URL params with store on mount
  useEffect(() => {
    if (initialRoomId) {
      console.log("[Chat Page] Setting room ID from URL:", initialRoomId);
      setRoomId(initialRoomId);
    }
    if (initialCharacterId) {
      console.log(
        "[Chat Page] Setting character ID from URL:",
        initialCharacterId,
      );
      setSelectedCharacterId(initialCharacterId);
    }
    // Set mode from URL parameter
    if (initialMode) {
      console.log("[Chat Page] Setting mode from URL:", initialMode);
      setMode(initialMode);
    }
  }, [initialRoomId, initialCharacterId, initialMode, setRoomId, setSelectedCharacterId, setMode]);

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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0A0A0A]">
      {/* Custom Chat Header with Agent Switcher and Mode Toggle */}
      <ChatHeader />
      
      {/* Signup prompt banner for anonymous users */}
      {!isAuthenticated && anonymousSession && (
        <SignupPromptBanner
          messageCount={anonymousSession.messageCount}
          messagesLimit={anonymousSession.messagesLimit}
        />
      )}

      {/* Main Content Area - Conditional based on mode */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {mode === "chat" ? (
          <>
            {/* Chat Mode: Sessions Sidebar + Chat Interface */}
            <SessionsSidebar />
            <div className="flex-1 overflow-hidden min-h-0">
              <ElizaChatInterface />
            </div>
          </>
        ) : (
          <>
            {/* Build Mode: Chat Interface + Agent DNA Panel */}
            <div className="flex-1 overflow-hidden min-h-0">
              <ElizaChatInterface />
            </div>
            <AgentDNAPanel />
          </>
        )}
      </div>
    </div>
  );
}
