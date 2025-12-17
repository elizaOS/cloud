"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, Sparkles } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import { ElizaChatInterface } from "./eliza-chat-interface";
import { useChatStore } from "@/lib/stores/chat-store";
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";
import { getThemeCSSVariables } from "@/lib/config/affiliate-themes";

/**
 * Chat interface component with dynamic theming and message limit enforcement.
 * Wraps ElizaChatInterface with session management, signup prompts, and affiliate theming.
 *
 * @param props - Chat interface configuration
 * @param props.character - Character data for the chat session
 * @param props.session - Optional session data including message limits
 * @param props.user - Optional user data
 * @param props.showSignupPrompt - Whether to display signup prompt banner
 * @param props.source - Source identifier for analytics
 * @param props.sessionTokenFromUrl - Optional session token from URL parameters
 * @param props.theme - Affiliate theme configuration for styling
 */

interface ChatInterfaceProps {
  character: UserCharacter;
  session?: {
    id: string;
    token: string;
    userId: string;
    messageCount: number;
    messagesLimit: number;
    messagesRemaining: number;
  };
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  showSignupPrompt?: boolean;
  source?: string;
  sessionTokenFromUrl?: string;
  theme: AffiliateTheme;
}

export function ChatInterface({
  character,
  session,
  user,
  showSignupPrompt = false,
  source,
  sessionTokenFromUrl,
  theme,
}: ChatInterfaceProps) {
  const router = useRouter();
  const { login } = usePrivy();
  const [messageCount, setMessageCount] = useState(session?.messageCount || 0);
  const [isLoadingSessionData, setIsLoadingSessionData] = useState(false);
  const {
    setSelectedCharacterId,
    setAnonymousSessionToken,
    loadRooms,
    rooms,
    setRoomId,
    roomId,
  } = useChatStore();
  const isAnonymous = !user && !!session;

  // Use refs for initialization tracking to avoid re-renders and infinite loops
  const roomInitializedRef = useRef(false);
  const roomInitializingRef = useRef(false);

  // CRITICAL: Fetch the LATEST session data from server on mount and when token changes
  // This ensures the message count is accurate after page reload, not stale from SSR props
  useEffect(() => {
    if (!sessionTokenFromUrl || user) {
      // No anonymous session or user is authenticated - skip
      return;
    }

    const fetchLatestSessionData = async () => {
      setIsLoadingSessionData(true);
      try {
        console.log(
          "[ChatInterface] 🔄 Fetching latest session data from server...",
        );
        const response = await fetch(
          `/api/anonymous-session?token=${sessionTokenFromUrl}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.session) {
            const serverCount = data.session.message_count;

            // Use functional update to compare against current state value
            // This avoids stale closure issues with messageCount
            setMessageCount((currentCount) => {
              console.log("[ChatInterface] ✅ Server session data:", {
                serverCount,
                currentLocalCount: currentCount,
                willUpdate: serverCount > currentCount,
              });

              // Only update if server has a higher count
              // This ensures we don't overwrite local increments that haven't synced yet
              if (serverCount > currentCount) {
                console.log(
                  "[ChatInterface] 📊 Updated message count from server:",
                  serverCount,
                );
                return serverCount;
              }
              return currentCount;
            });
          }
        } else {
          console.warn(
            "[ChatInterface] ⚠️ Failed to fetch session data:",
            response.status,
          );
        }
      } catch (error) {
        console.error("[ChatInterface] Error fetching session data:", error);
      } finally {
        setIsLoadingSessionData(false);
      }
    };

    // Fetch immediately on mount
    fetchLatestSessionData();
  }, [sessionTokenFromUrl, user]); // Only re-run if token changes or auth state changes

  // Callback to sync message count when a message is sent successfully
  // This is called from ElizaChatInterface after a successful message
  // NOTE: The actual increment happens server-side in message-handler.ts
  // This callback just fetches the latest count to update the UI
  const onMessageSent = useCallback(async () => {
    if (isAnonymous && sessionTokenFromUrl) {
      console.log(
        "[ChatInterface] 📊 Message sent, fetching latest count for token:",
        sessionTokenFromUrl.slice(0, 8) + "...",
      );

      try {
        const response = await fetch(
          `/api/anonymous-session?token=${sessionTokenFromUrl}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.session) {
            const serverCount = data.session.message_count;
            console.log(
              "[ChatInterface] ✅ Fetched latest count from server:",
              serverCount,
            );
            setMessageCount(serverCount);
          }
        } else {
          console.warn(
            "[ChatInterface] ⚠️ Failed to fetch session data:",
            response.status,
          );
        }
      } catch (error) {
        console.error("[ChatInterface] Error fetching session data:", error);
      }
    }
  }, [isAnonymous, sessionTokenFromUrl]);
  const messagesRemaining = session
    ? session.messagesLimit - messageCount
    : Infinity;
  const progress = session ? (messageCount / session.messagesLimit) * 100 : 0;

  // Show signup prompt after 2 messages (encouraging earlier)
  const shouldShowSoftPrompt =
    isAnonymous && messageCount >= 2 && messagesRemaining > 0;

  // Hard paywall when no messages remaining (5 messages for free users)
  const shouldShowPaywall = isAnonymous && messagesRemaining <= 0;

  // Get CSS variables for theming
  const themeStyles = getThemeCSSVariables(theme);

  // Debug logging - IMPORTANT: Check console to understand auth state
  useEffect(() => {
    console.log("[ChatInterface] 🔍 DEBUG - Auth & Theme State:", {
      themeId: theme.id,
      hasSession: !!session,
      sessionDetails: session
        ? {
            messageCount: session.messageCount,
            messagesLimit: session.messagesLimit,
            messagesRemaining: session.messagesRemaining,
          }
        : "NO SESSION PROP",
      hasUser: !!user,
      userDetails: user ? { id: user.id, name: user.name } : "NO USER PROP",
      isAnonymous,
      messagesRemaining,
      shouldShowBanner: isAnonymous && !shouldShowPaywall,
      source,
      reason: user
        ? "USER IS LOGGED IN VIA PRIVY - No banner for authenticated users"
        : !session
          ? "SESSION PROP IS MISSING - Check page.tsx Case B logic"
          : "ANONYMOUS USER WITH SESSION - Banner should show",
    });
  }, [
    theme.id,
    session,
    user,
    isAnonymous,
    messagesRemaining,
    source,
    shouldShowPaywall,
  ]);

  // CRITICAL: Set the selected character ID so ElizaChatInterface knows which character to use
  useEffect(() => {
    setSelectedCharacterId(character.id);
  }, [character.id, setSelectedCharacterId]);

  // CRITICAL: Set anonymous session token in store so ElizaChatInterface can use it for API requests
  // This prevents the race condition where the cookie might not be set yet
  useEffect(() => {
    if (sessionTokenFromUrl && !user) {
      setAnonymousSessionToken(sessionTokenFromUrl);
      console.log(
        "[ChatInterface] Set anonymous session token in store:",
        sessionTokenFromUrl.slice(0, 8) + "...",
      );
    }
  }, [sessionTokenFromUrl, user, setAnonymousSessionToken]);

  // CRITICAL: Load existing rooms and auto-select the room for this character
  // This ensures conversation persists across page reloads for affiliate users
  // Using refs to prevent infinite loops - the effect only runs ONCE per character
  useEffect(() => {
    // Skip if already initialized for this character or currently initializing
    if (roomInitializedRef.current || roomInitializingRef.current) {
      return;
    }

    // Skip if we already have a room selected
    if (roomId) {
      roomInitializedRef.current = true;
      return;
    }

    // Skip if no character ID
    if (!character.id) {
      return;
    }

    const initializeRoom = async () => {
      roomInitializingRef.current = true;

      const currentEntityId = useChatStore.getState().entityId;
      console.log(
        "[ChatInterface] 🔄 Initializing room for character:",
        character.id,
        "entityId:",
        currentEntityId,
      );

      try {
        // Load rooms (this uses internal deduplication)
        await loadRooms(true);

        // Get the current rooms from store
        const currentRooms = useChatStore.getState().rooms;
        console.log(
          "[ChatInterface] Loaded rooms:",
          currentRooms.length,
          "rooms:",
          currentRooms.map((r) => ({ id: r.id, characterId: r.characterId })),
        );

        // Find an existing room for this character
        const existingRoom = currentRooms.find(
          (room) => room.characterId === character.id,
        );

        if (existingRoom) {
          console.log(
            "[ChatInterface] ✅ Found existing room:",
            existingRoom.id,
          );
          setRoomId(existingRoom.id);
        } else {
          console.log(
            "[ChatInterface] No existing room found for character:",
            character.id,
          );
        }

        // Mark as initialized so we don't try again
        roomInitializedRef.current = true;
      } catch (error) {
        console.error("[ChatInterface] Error initializing room:", error);
        // Still mark as initialized to prevent retry loops
        roomInitializedRef.current = true;
      } finally {
        roomInitializingRef.current = false;
      }
    };

    initializeRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]); // Only depend on character.id - other deps are stable or accessed via refs/getState

  // CRITICAL: Set anonymous session cookie if session token is in URL (for affiliate users)
  // This ensures the cookie is set even if we're not sure about auth state yet
  // Also store in localStorage so PrivyProvider can access it (httpOnly cookies aren't readable via JS)
  useEffect(() => {
    // Only set cookie if we have a session token AND user is NOT authenticated
    // (authenticated users don't need the anonymous session cookie)
    if (sessionTokenFromUrl && !user) {
      console.log(
        "[ChatInterface] Setting anonymous session cookie from URL:",
        sessionTokenFromUrl.slice(0, 8) + "...",
      );

      // Store in localStorage as backup (httpOnly cookies can't be read by JS)
      try {
        localStorage.setItem("eliza-anon-session-token", sessionTokenFromUrl);
        console.log("[ChatInterface] ✅ Session token stored in localStorage");
      } catch (e) {
        console.warn(
          "[ChatInterface] Failed to store session in localStorage:",
          e,
        );
      }

      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
      }).then(async (res) => {
        if (res.ok) {
          console.log(
            "[ChatInterface] ✅ Anonymous session cookie set successfully",
          );
        } else {
          const errorData = await res.json();
          console.error(
            "[ChatInterface] ❌ Failed to set session cookie:",
            res.status,
            errorData,
          );
        }
      });
    }
  }, [sessionTokenFromUrl, user]);

  useEffect(() => {
    // Track affiliate source
    if (source) {
      console.log(
        `[Analytics] User from ${source} started chatting with ${character.name}`,
      );
    }
  }, [source, character.name]);

  const handleUpgrade = () => {
    toast.info("Redirecting to signup...");
    router.push(
      `/login?redirect=/chat/${character.id}&session=${session?.token}`,
    );
  };

  const handleSignup = async () => {
    try {
      // Open Privy login modal
      await login();
      toast.success("Welcome! Your chat is now unlimited.");
      // Page will refresh after successful auth via Privy
    } catch (error) {
      console.error("[ChatInterface] Signup error:", error);
      toast.error("Failed to open signup. Please try again.");
    }
  };

  // Paywall view
  if (shouldShowPaywall) {
    return (
      <div
        style={themeStyles}
        className="min-h-screen flex items-center justify-center p-4 themed-chat bg-gradient-to-b from-background to-muted/20"
      >
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full p-4 bg-primary/10">
              <InfoIcon className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">
              Log in to save {character.name}
            </h2>
            <p className="text-muted-foreground">
              Create a free account to keep chatting and save your character
            </p>
          </div>

          <div className="rounded-lg p-4 space-y-2 bg-muted/50">
            <p className="font-medium">What you get for free:</p>
            <ul className="text-sm text-left space-y-1 text-muted-foreground">
              <li>✅ Save your character forever</li>
              <li>✅ Continue chatting with $1.00 free credits</li>
              <li>✅ Access from any device</li>
              <li>✅ Create more characters</li>
            </ul>
          </div>

          <Button size="lg" className="w-full" onClick={handleUpgrade}>
            <Sparkles className="w-4 h-4 mr-2" />
            Log In Free
          </Button>

          <p className="text-xs text-muted-foreground">
            No credit card required • Takes 30 seconds
          </p>
        </Card>

        {/* Theme CSS Variables */}
        <style jsx global>{`
          .themed-chat {
            --theme-primary: ${theme.colors.primary};
            --theme-primary-light: ${theme.colors.primaryLight};
            --theme-accent: ${theme.colors.accent};
            --theme-gradient-from: ${theme.colors.gradientFrom};
            --theme-gradient-to: ${theme.colors.gradientTo};
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={themeStyles} className="h-screen flex flex-col themed-chat">
      {/* Free messages banner (anonymous only) */}
      {isAnonymous && !shouldShowPaywall && (
        <div className="border-b backdrop-blur-sm bg-muted/30">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">
                  {messagesRemaining} messages left
                </Badge>
                <div className="w-32 h-2 rounded-full overflow-hidden bg-muted">
                  <div
                    className="h-full transition-all duration-300 bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleUpgrade}>
                <Sparkles className="w-4 h-4 mr-2" />
                Unlock Unlimited
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Soft signup prompt (5-9 messages) */}
      {shouldShowSoftPrompt && (
        <div className="border-b backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3">
            <Alert className="border-primary/50 bg-primary/5">
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                Enjoying the conversation? Sign up for free to get unlimited
                messages and save your chat history.
                <Button
                  size="sm"
                  variant="link"
                  onClick={handleUpgrade}
                  className="ml-2"
                >
                  Sign up free →
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Chat interface */}
      <div className="flex-1 overflow-hidden">
        <ElizaChatInterface
          onMessageSent={onMessageSent}
          character={character}
        />
      </div>

      {/* Theme CSS Variables */}
      <style jsx global>{`
        .themed-chat {
          --theme-primary: ${theme.colors.primary};
          --theme-primary-light: ${theme.colors.primaryLight};
          --theme-accent: ${theme.colors.accent};
          --theme-gradient-from: ${theme.colors.gradientFrom};
          --theme-gradient-to: ${theme.colors.gradientTo};
        }
      `}</style>
    </div>
  );
}
