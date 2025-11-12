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
import { useRouter } from "next/navigation";
import { isTemplateCharacter } from "@/lib/characters/template-loader";

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
  const router = useRouter();

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

  // Resolve template IDs to real DB IDs (for authenticated users)
  useEffect(() => {
    if (!isAuthenticated || !initialCharacterId) return;

    if (isTemplateCharacter(initialCharacterId)) {
      console.log(
        "[Chat Page] Detected template ID, resolving:",
        initialCharacterId,
      );

      fetch("/api/eliza/characters/resolve-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: initialCharacterId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.exists && data.realId) {
            console.log(
              "[Chat Page] Resolved template to real ID:",
              data.realId,
            );

            const params = new URLSearchParams();
            if (initialRoomId) params.set("roomId", initialRoomId);
            params.set("characterId", data.realId);
            if (initialMode) params.set("mode", initialMode);

            router.replace(`/dashboard/chat?${params.toString()}`);
            setSelectedCharacterId(data.realId);
          } else {
            console.log(
              "[Chat Page] Template not yet created, keeping template ID:",
              initialCharacterId,
            );
            setSelectedCharacterId(initialCharacterId);
          }
        })
        .catch((error) => {
          console.error("[Chat Page] Failed to resolve template:", error);
          setSelectedCharacterId(initialCharacterId);
        });
    } else {
      setSelectedCharacterId(initialCharacterId);
    }
  }, [
    isAuthenticated,
    initialCharacterId,
    initialRoomId,
    initialMode,
    router,
    setSelectedCharacterId,
  ]);

  // Sync URL params with store on mount
  useEffect(() => {
    // CRITICAL: Clear or set roomId based on URL params
    // This prevents stale room selection from persisting
    if (initialRoomId) {
      setRoomId(initialRoomId);
    } else {
      setRoomId(null);
    }
    // Set mode from URL parameter
    if (initialMode) {
      setMode(initialMode);
    }
    // CRITICAL: Clear character selection when navigating to /chat without characterId
    // This prevents stale character selection from persisting
    if (initialCharacterId) {
      setSelectedCharacterId(initialCharacterId);
    } else {
      setSelectedCharacterId(null);
    }
  }, [
    initialRoomId,
    initialMode,
    initialCharacterId,
    setRoomId,
    setMode,
    setSelectedCharacterId,
  ]);

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
