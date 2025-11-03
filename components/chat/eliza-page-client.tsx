"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CornerBrackets } from "@/components/brand";
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

  useSetPageHeader({
    title: "Eliza Agent",
    description:
      "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

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
      console.log("[Eliza Page] Character ID from URL:", characterId);
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Signup prompt banner for anonymous users */}
      {!isAuthenticated && anonymousSession && (
        <SignupPromptBanner
          messageCount={anonymousSession.messageCount}
          messagesLimit={anonymousSession.messagesLimit}
        />
      )}

      <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-hidden p-6">
        <div className="relative flex flex-1 min-h-0 overflow-hidden rounded-none border border-white/10 bg-black/40">
          {/* Corner brackets */}
          <CornerBrackets
            size="md"
            variant="full-border"
            className="m-2 opacity-50"
          />

          <ElizaChatInterface
            availableCharacters={initialCharacters}
            initialCharacterId={initialCharacterId}
          />
        </div>
      </div>
    </div>
  );
}
