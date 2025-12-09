/**
 * Build page client component for character building interface.
 * Initializes chat store, handles anonymous sessions, and displays build mode with signup prompts.
 *
 * @param props - Build page client configuration
 * @param props.initialCharacters - Initial list of characters
 * @param props.isAuthenticated - Whether user is authenticated
 * @param props.initialCharacterId - Optional initial character ID
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CharacterBuildMode } from "@/components/chat/character-build-mode";
import { SignupPromptBanner } from "@/components/chat/signup-prompt-banner";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { useChatStore, type Character } from "@/lib/stores/chat-store";
import type { ElizaCharacter } from "@/lib/types";
import { getOrCreateAnonymousUserAction } from "@/app/actions/anonymous";
import { TriangleAlert } from "lucide-react";

interface BuildPageClientProps {
  initialCharacters: ElizaCharacter[];
  isAuthenticated: boolean;
  initialCharacterId?: string;
}

export function BuildPageClient({
  initialCharacters,
  isAuthenticated,
  initialCharacterId,
}: BuildPageClientProps) {
  const [anonymousSession, setAnonymousSession] = useState<{
    messageCount: number;
    messagesLimit: number;
    remainingMessages: number;
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated);
  const [showWarning, setShowWarning] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  // Initialize store with characters
  const { setAvailableCharacters, setSelectedCharacterId } = useChatStore();

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
      avatarUrl: char.avatarUrl || char.avatar_url || undefined,
    }));

    setAvailableCharacters(characters);

    // Set selected character from URL if provided
    if (initialCharacterId) {
      setSelectedCharacterId(initialCharacterId);
    }
  }, [
    initialCharacters,
    initialCharacterId,
    setAvailableCharacters,
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
    }
  }, [isAuthenticated, anonymousSession]);

  // Intercept Next.js navigation
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor && anchor.href) {
        const url = new URL(anchor.href);
        const currentUrl = new URL(window.location.href);

        if (url.pathname !== currentUrl.pathname) {
          e.preventDefault();
          e.stopPropagation();
          setShowWarning(true);

          interface WindowWithPendingNavigation extends Window {
            __pendingNavigation?: string | null;
          }
          (window as WindowWithPendingNavigation).__pendingNavigation = anchor.href;
        }
      }

      const button = target.closest("button");
      if (button && button.textContent?.toLowerCase().includes("back")) {
        e.preventDefault();
        e.stopPropagation();
        setShowWarning(true);
        (window as WindowWithPendingNavigation).__pendingNavigation = "back";
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [hasUnsavedChanges, pathname]);

  interface WindowWithPendingNavigation extends Window {
    __pendingNavigation?: string | null;
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleConfirmLeave = () => {
    setShowWarning(false);
    setHasUnsavedChanges(false);

    const pending = (window as WindowWithPendingNavigation).__pendingNavigation;
    if (pending === "back") {
      router.back();
    } else if (pending) {
      window.location.href = pending;
    }
    (window as WindowWithPendingNavigation).__pendingNavigation = null;
  };

  const handleCancelLeave = () => {
    setShowWarning(false);
    (window as WindowWithPendingNavigation).__pendingNavigation = null;
  };

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
      {/* Navigation Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-black border border-white/10 rounded-none p-6 flex flex-col items-center gap-4">
            <TriangleAlert className="text-red-500 h-12 w-12" />
            <h1 className="text-center">You have unsaved changes</h1>
            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={handleConfirmLeave}
                className="px-4 py-2 border border-white/10 rounded-none bg-red-600/40 hover:bg-red-600/20"
              >
                Leave
              </button>
              <button
                onClick={handleCancelLeave}
                className="px-4 py-2 border border-white/10 rounded-none hover:bg-white/5"
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signup prompt banner for anonymous users */}
      {!isAuthenticated && anonymousSession && (
        <SignupPromptBanner
          messageCount={anonymousSession.messageCount}
          messagesLimit={anonymousSession.messagesLimit}
        />
      )}

      {/* Build Mode */}
      <div className="flex flex-1 overflow-hidden">
        <CharacterBuildMode
          initialCharacters={initialCharacters}
          onUnsavedChanges={setHasUnsavedChanges}
        />
      </div>
    </div>
  );
}
