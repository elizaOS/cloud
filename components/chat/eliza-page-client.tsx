"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { CloneUrCrushSignupModal } from "@/components/chat/clone-ur-crush-signup-modal";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CornerBrackets } from "@/components/brand";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";
import { useCloneUrCrushIntake } from "@/hooks/flows/useCloneUrCrushIntake";

// Clone Your Crush intake is handled by useCloneYourCrushIntake

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
}

export function ElizaPageClient({
  initialCharacters: initialCharactersProp,
  isAuthenticated: serverIsAuthenticated,
}: ElizaPageClientProps) {
  // Use Privy's client-side auth state (updates immediately when user authenticates)
  const { authenticated } = usePrivy();
  const isAuthenticated = authenticated || serverIsAuthenticated;
  const [availableCharacters, setAvailableCharacters] = useState<ElizaCharacter[]>(initialCharactersProp);
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
  const { pendingCharacter: cloneYourCrushCharacter, isSaving: isSavingCharacter } =
    useCloneUrCrushIntake({
      isAuthenticated,
      onSaved: (savedCharacter: ElizaCharacter) => {
        // Add the saved character and trigger room creation
        setAvailableCharacters((prev) => [...prev, savedCharacter]);
        setInitialCharacterId(savedCharacter.id || null);
      },
    });

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

  // Clone Ur Crush flow handled by useCloneUrCrushIntake

  // Effect 3: Normal characterId flow
  useEffect(() => {
    const source = searchParams.get("source");
    if (source === 'clone-ur-crush') return; // Skip if CLONE_UR_CRUSH flow
    
    const characterId = searchParams.get("characterId");
    if (characterId) {
      setInitialCharacterId(characterId);
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
      {/* Clone Your Crush Signup Modal - only show if unauthenticated AND we have character */}
      {!isAuthenticated && cloneYourCrushCharacter && (
        <CloneUrCrushSignupModal character={cloneYourCrushCharacter} />
      )}

      {/* Signup prompt banner for anonymous users - hide if showing Clone Your Crush modal */}
      {!isAuthenticated && anonymousSession && !cloneYourCrushCharacter && (
        <SignupPromptBanner
          messageCount={anonymousSession.messageCount}
          messagesLimit={anonymousSession.messagesLimit}
        />
      )}

      {/* Loading state while saving character */}
      {isSavingCharacter && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mx-auto" />
            <p className="text-white/80 text-sm">Creating your character...</p>
          </div>
        </div>
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
            key={initialCharacterId || 'default'}
            availableCharacters={availableCharacters}
            initialCharacterId={initialCharacterId}
          />
        </div>
      </div>
    </div>
  );
}
