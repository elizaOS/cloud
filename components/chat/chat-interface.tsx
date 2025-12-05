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
import { useChatStore } from "@/stores/chat-store";
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";
import { getThemeCSSVariables } from "@/lib/config/affiliate-themes";
import { useRenderTracker } from "@/lib/debug/render-tracker";

/**
 * Unified Chat Interface Component with Dynamic Theming
 *
 * This is a wrapper component that:
 * 1. Shows free message count for anonymous users
 * 2. Displays signup prompts at appropriate times
 * 3. Enforces message limits
 * 4. Integrates with the Eliza chat system
 * 5. Applies affiliate-specific theming via CSS variables
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
  // Track renders in development
  useRenderTracker("ChatInterface");

  const router = useRouter();
  const { login } = usePrivy();
  const [messageCount, setMessageCount] = useState(session?.messageCount || 0);
  const [isLoadingSessionData, setIsLoadingSessionData] = useState(false);
  const { setSelectedCharacterId, setAnonymousSessionToken, loadRooms, rooms, setRoomId, roomId } = useChatStore();
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
        console.log("[ChatInterface] 🔄 Fetching latest session data from server...");
        const response = await fetch(`/api/anonymous-session?token=${sessionTokenFromUrl}`);
        
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
                  serverCount
                );
                return serverCount;
              }
              return currentCount;
            });
          }
        } else {
          console.warn("[ChatInterface] ⚠️ Failed to fetch session data:", response.status);
        }
      } catch (error) {
        console.error("[ChatInterface] ❌ Error fetching session data:", error);
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
      console.log("[ChatInterface] 📊 Message sent, fetching latest count for token:", sessionTokenFromUrl.slice(0, 8) + "...");

      try {
        const response = await fetch(`/api/anonymous-session?token=${sessionTokenFromUrl}`);

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.session) {
            const serverCount = data.session.message_count;
            console.log("[ChatInterface] ✅ Fetched latest count from server:", serverCount);
            setMessageCount(serverCount);
          }
        } else {
          console.warn("[ChatInterface] ⚠️ Failed to fetch session data:", response.status);
        }
      } catch (error) {
        console.error("[ChatInterface] ❌ Error fetching session data:", error);
      }
    }
  }, [isAnonymous, sessionTokenFromUrl]);
  const messagesRemaining = session
    ? session.messagesLimit - messageCount
    : Infinity;
  const progress = session ? (messageCount / session.messagesLimit) * 100 : 0;

  // Show signup prompt after 5 messages
  const shouldShowSoftPrompt =
    isAnonymous && messageCount >= 5 && messageCount < 10;

  // Hard paywall at 10 messages
  const shouldShowPaywall = isAnonymous && messagesRemaining <= 0;

  // Theme-specific styling flags
  const isRomanticTheme = theme.variants.introCard === "romantic";
  const isEdadTheme = theme.id === "e-dad";
  const isCustomTheme = isRomanticTheme || isEdadTheme;
  const showAnimatedBackground = theme.features.animatedBackground;

  // Get CSS variables for theming
  const themeStyles = getThemeCSSVariables(theme);

  // Convert RGB string to usable CSS color format
  const rgbToColor = (rgb: string) => `rgb(${rgb.replace(/ /g, ', ')})`;
  const rgbToColorAlpha = (rgb: string, alpha: number) => `rgba(${rgb.replace(/ /g, ', ')}, ${alpha})`;

  // Pre-computed theme colors for inline styles (romantic theme - pink)
  const themeColors = isRomanticTheme ? {
    primary: rgbToColor(theme.colors.primary),
    primaryLight: rgbToColor(theme.colors.primaryLight),
    accent: rgbToColor(theme.colors.accent),
    primaryAlpha15: rgbToColorAlpha(theme.colors.primary, 0.15),
    primaryAlpha10: rgbToColorAlpha(theme.colors.primary, 0.1),
    primaryAlpha20: rgbToColorAlpha(theme.colors.primary, 0.2),
    primaryAlpha30: rgbToColorAlpha(theme.colors.primary, 0.3),
    accentAlpha10: rgbToColorAlpha(theme.colors.accent, 0.1),
    gradient: `linear-gradient(135deg, ${rgbToColor(theme.colors.primary)}, ${rgbToColor(theme.colors.gradientTo)})`,
  } : null;

  // Pre-computed theme colors for edad theme (warm amber/gold)
  const edadColors = isEdadTheme ? {
    primary: rgbToColor(theme.colors.primary),
    primaryLight: rgbToColor(theme.colors.primaryLight),
    accent: rgbToColor(theme.colors.accent),
    primaryAlpha15: rgbToColorAlpha(theme.colors.primary, 0.15),
    primaryAlpha10: rgbToColorAlpha(theme.colors.primary, 0.1),
    primaryAlpha20: rgbToColorAlpha(theme.colors.primary, 0.2),
    primaryAlpha30: rgbToColorAlpha(theme.colors.primary, 0.3),
    accentAlpha10: rgbToColorAlpha(theme.colors.accent, 0.1),
    gradient: `linear-gradient(135deg, ${rgbToColor(theme.colors.primary)}, ${rgbToColor(theme.colors.gradientTo)})`,
  } : null;

  // Unified active theme colors (for romantic or edad themes)
  const activeColors = themeColors || edadColors;

  // Debug logging - IMPORTANT: Check console to understand auth state
  useEffect(() => {
    console.log("[ChatInterface] 🔍 DEBUG - Auth & Theme State:", {
      themeId: theme.id,
      isRomanticTheme,
      hasSession: !!session,
      sessionDetails: session ? {
        messageCount: session.messageCount,
        messagesLimit: session.messagesLimit,
        messagesRemaining: session.messagesRemaining,
      } : "NO SESSION PROP",
      hasUser: !!user,
      userDetails: user ? { id: user.id, name: user.name } : "NO USER PROP",
      isAnonymous,
      messagesRemaining,
      shouldShowBanner: isAnonymous && !shouldShowPaywall,
      source,
      reason: user ? "USER IS LOGGED IN VIA PRIVY - No banner for authenticated users" 
             : !session ? "SESSION PROP IS MISSING - Check page.tsx Case B logic"
             : "ANONYMOUS USER WITH SESSION - Banner should show",
    });
  }, [theme.id, isRomanticTheme, session, user, isAnonymous, messagesRemaining, source, shouldShowPaywall]);

  // CRITICAL: Set the selected character ID so ElizaChatInterface knows which character to use
  useEffect(() => {
    setSelectedCharacterId(character.id);
  }, [character.id, setSelectedCharacterId]);

  // CRITICAL: Set anonymous session token in store so ElizaChatInterface can use it for API requests
  // This prevents the race condition where the cookie might not be set yet
  useEffect(() => {
    if (sessionTokenFromUrl && !user) {
      setAnonymousSessionToken(sessionTokenFromUrl);
      console.log("[ChatInterface] Set anonymous session token in store:", sessionTokenFromUrl.slice(0, 8) + "...");
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
      console.log("[ChatInterface] 🔄 Initializing room for character:", character.id, "entityId:", currentEntityId);
      
      try {
        // Load rooms (this uses internal deduplication)
        await loadRooms(true);
        
        // Get the current rooms from store
        const currentRooms = useChatStore.getState().rooms;
        console.log("[ChatInterface] Loaded rooms:", currentRooms.length, "rooms:", currentRooms.map(r => ({ id: r.id, characterId: r.characterId })));
        
        // Find an existing room for this character
        const existingRoom = currentRooms.find(room => room.characterId === character.id);
        
        if (existingRoom) {
          console.log("[ChatInterface] ✅ Found existing room:", existingRoom.id);
          setRoomId(existingRoom.id);
        } else {
          console.log("[ChatInterface] No existing room found for character:", character.id);
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
      console.log("[ChatInterface] Setting anonymous session cookie from URL:", sessionTokenFromUrl.slice(0, 8) + "...");

      // Store in localStorage as backup (httpOnly cookies can't be read by JS)
      try {
        localStorage.setItem("eliza-anon-session-token", sessionTokenFromUrl);
        console.log("[ChatInterface] ✅ Session token stored in localStorage");
      } catch (e) {
        console.warn("[ChatInterface] Failed to store session in localStorage:", e);
      }

      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
      })
        .then(async (res) => {
          if (res.ok) {
            console.log(
              "[ChatInterface] ✅ Anonymous session cookie set successfully",
            );
          } else {
            const errorData = await res.json().catch(() => ({}));
            console.error(
              "[ChatInterface] ❌ Failed to set session cookie:",
              res.status,
              errorData,
            );
          }
        })
        .catch((err) => {
          console.error(
            "[ChatInterface] ❌ Error setting session cookie:",
            err,
          );
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
  

  // Paywall view with theme support
  if (shouldShowPaywall) {
    return (
      <div
        style={themeStyles}
        className={`min-h-screen flex items-center justify-center p-4 themed-chat ${
          isCustomTheme
            ? "bg-black bg-[radial-gradient(ellipse_at_top,rgba(var(--theme-primary),0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent),0.1),transparent_50%)]"
            : "bg-gradient-to-b from-background to-muted/20"
        }`}
      >
        <Card
          className={`max-w-md w-full p-8 text-center space-y-6 ${
            isCustomTheme
              ? "bg-white/[0.05] border-[rgba(var(--theme-primary),0.3)] backdrop-blur-sm"
              : ""
          }`}
        >
          <div className="flex justify-center">
            <div
              className={`rounded-full p-4 ${
                isCustomTheme
                  ? "bg-[rgba(var(--theme-primary),0.2)]"
                  : "bg-primary/10"
              }`}
            >
              <InfoIcon
                className={`w-8 h-8 ${
                  isCustomTheme
                    ? "text-[rgb(var(--theme-primary-light))]"
                    : "text-primary"
                }`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h2
              className={`text-2xl font-bold ${isRomanticTheme ? "text-white" : ""}`}
            >
              You&apos;ve reached your free message limit
            </h2>
            <p
              className={
                isRomanticTheme ? "text-white/70" : "text-muted-foreground"
              }
            >
              Sign up for free to continue chatting with {character.name}
            </p>
          </div>

          <div
            className={`rounded-lg p-4 space-y-2 ${
              isCustomTheme ? "bg-white/[0.05]" : "bg-muted/50"
            }`}
          >
            <p className={`font-medium ${isCustomTheme ? "text-white" : ""}`}>
              What you get:
            </p>
            <ul
              className={`text-sm text-left space-y-1 ${
                isCustomTheme ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              <li>✅ Unlimited messages</li>
              <li>✅ Save your chat history</li>
              <li>✅ Access from any device</li>
              <li>✅ Create more characters</li>
            </ul>
          </div>

          <Button
            size="lg"
            className={`w-full ${
              isCustomTheme
                ? "bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-gradient-to))] hover:from-[rgb(var(--theme-primary-light))] hover:to-[rgb(var(--theme-primary))] text-white shadow-lg shadow-[rgba(var(--theme-primary),0.3)]"
                : ""
            }`}
            onClick={handleUpgrade}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Sign Up Free
          </Button>

          <p
            className={`text-xs ${isRomanticTheme ? "text-white/50" : "text-muted-foreground"}`}
          >
            No credit card required
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
    <div
      style={themeStyles}
      className={`h-screen flex flex-col themed-chat ${
        isCustomTheme
          ? "bg-black bg-[radial-gradient(ellipse_at_top,rgba(var(--theme-primary),0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent),0.1),transparent_50%)]"
          : ""
      } ${isRomanticTheme ? "romantic-theme" : ""} ${isEdadTheme ? "edad-theme" : ""}`}
    >
      {/* Animated background for romantic/edad themes */}
      {showAnimatedBackground && (themeColors || edadColors) && (
        <div className="fixed inset-0 -z-10">
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-primary),0.08),transparent_70%)] animate-pulse"
            style={{ animationDuration: "4s" }}
          />
        </div>
      )}

      {/* Free messages banner (anonymous only) */}
      {isAnonymous && !shouldShowPaywall && (
        <div
          className={`border-b backdrop-blur-sm ${
            isCustomTheme ? "border-white/10 bg-white/[0.02]" : "bg-muted/30"
          }`}
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className={
                    isCustomTheme
                      ? "bg-[rgba(var(--theme-primary),0.1)] text-[rgb(var(--theme-primary-light))] border-[rgba(var(--theme-primary),0.2)]"
                      : ""
                  }
                >
                  {messagesRemaining} messages left
                </Badge>
                <div
                  className={`w-32 h-2 rounded-full overflow-hidden ${
                    isCustomTheme ? "bg-white/10" : "bg-muted"
                  }`}
                >
                  <div
                    className={`h-full transition-all duration-300 ${
                      isCustomTheme
                        ? "bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-gradient-to))]"
                        : "bg-primary"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={isCustomTheme ? handleSignup : handleUpgrade}
                className={
                  isCustomTheme
                    ? "border-[rgba(var(--theme-primary),0.3)] text-[rgb(var(--theme-primary-light))] hover:bg-[rgba(var(--theme-primary),0.1)] hover:text-[rgb(var(--theme-primary-light))]"
                    : ""
                }
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Unlock Unlimited
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Soft signup prompt (5-9 messages) */}
      {shouldShowSoftPrompt && (
        <div
          className={`border-b backdrop-blur-sm ${
            isCustomTheme
              ? "border-[rgba(var(--theme-primary),0.2)] bg-gradient-to-r from-[rgba(var(--theme-primary),0.1)] to-[rgba(var(--theme-accent),0.1)]"
              : ""
          }`}
        >
          <div className="container mx-auto px-4 py-3">
            <Alert
              className={
                isCustomTheme
                  ? "border-[rgba(var(--theme-primary),0.3)] bg-transparent"
                  : "border-primary/50 bg-primary/5"
              }
            >
              <Sparkles
                className={`h-4 w-4 ${
                  isCustomTheme
                    ? "text-[rgb(var(--theme-primary-light))]"
                    : ""
                }`}
              />
              <AlertDescription
                className={isCustomTheme ? "text-white/80" : ""}
              >
                Enjoying the conversation? Sign up for free to get unlimited
                messages and save your chat history.
                <Button
                  size="sm"
                  variant="link"
                  onClick={isCustomTheme ? handleSignup : handleUpgrade}
                  className={`ml-2 ${
                    isCustomTheme
                      ? "text-[rgb(var(--theme-primary-light))] hover:text-[rgb(var(--theme-primary-light))]"
                      : ""
                  }`}
                >
                  Sign up free →
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Chat interface with theme styling */}
      <div
        className={`flex-1 overflow-hidden ${isRomanticTheme ? "chat-theme-romantic" : ""} ${isEdadTheme ? "chat-theme-edad" : ""}`}
      >
        <ElizaChatInterface onMessageSent={onMessageSent} />
      </div>

      {/* Pink/Romantic Theme CSS for Clone Your Crush */}
      <style jsx global>{`
        /* Romantic theme - pink gradients and styling */
        .romantic-theme {
          background: 
            radial-gradient(ellipse at top, rgba(219, 39, 119, 0.15), transparent 50%),
            radial-gradient(ellipse at bottom, rgba(147, 51, 234, 0.1), transparent 50%),
            black !important;
        }
        
        /* Animated pulse background */
        .romantic-theme::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse at center, rgba(219, 39, 119, 0.08), transparent 70%);
          animation: pulse 4s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        /* Chat bubble styling for romantic theme */
        .romantic-theme .chat-theme-romantic [data-role="assistant"] {
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(219, 39, 119, 0.2) !important;
          border-radius: 18px 18px 18px 4px !important;
          backdrop-filter: blur(10px);
        }
        
        .romantic-theme .chat-theme-romantic [data-role="user"] {
          background: linear-gradient(135deg, rgba(219, 39, 119, 0.9), rgba(244, 114, 182, 0.9)) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 18px 18px 4px 18px !important;
        }
        
        /* Send button pink styling */
        .romantic-theme button[type="submit"] {
          background: linear-gradient(135deg, rgb(219, 39, 119), rgb(244, 114, 182)) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(219, 39, 119, 0.4) !important;
        }
        
        .romantic-theme button[type="submit"]:hover:not(:disabled) {
          background: linear-gradient(135deg, rgb(244, 114, 182), rgb(219, 39, 119)) !important;
          transform: translateY(-1px);
        }
        
        /* Input styling */
        .romantic-theme form {
          border: 1px solid rgba(219, 39, 119, 0.25) !important;
          border-radius: 16px !important;
          background: rgba(255, 255, 255, 0.03) !important;
        }
        
        .romantic-theme form:focus-within {
          border-color: rgba(219, 39, 119, 0.5) !important;
          box-shadow: 0 0 20px rgba(219, 39, 119, 0.15) !important;
        }
        
        /* Scrollbar */
        .romantic-theme ::-webkit-scrollbar-thumb {
          background: rgba(219, 39, 119, 0.3) !important;
        }
        
        .romantic-theme ::-webkit-scrollbar-thumb:hover {
          background: rgba(219, 39, 119, 0.5) !important;
        }
        
        /* Voice button */
        .romantic-theme button[type="button"] {
          color: rgb(244, 114, 182) !important;
          border-color: rgba(219, 39, 119, 0.3) !important;
        }

        .romantic-theme button[type="button"]:hover {
          background: rgba(219, 39, 119, 0.1) !important;
        }

        /* ============================================= */
        /* Edad Theme CSS - Warm Amber/Gold for AI Dad */
        /* ============================================= */

        /* Edad theme - warm amber gradients and styling */
        .edad-theme {
          background:
            radial-gradient(ellipse at top, rgba(245, 158, 11, 0.15), transparent 50%),
            radial-gradient(ellipse at bottom, rgba(217, 119, 6, 0.1), transparent 50%),
            black !important;
        }

        /* Animated pulse background for edad */
        .edad-theme::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse at center, rgba(245, 158, 11, 0.08), transparent 70%);
          animation: pulse 4s ease-in-out infinite;
        }

        /* Chat bubble styling for edad theme */
        .edad-theme .chat-theme-edad [data-role="assistant"] {
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(245, 158, 11, 0.2) !important;
          border-radius: 18px 18px 18px 4px !important;
          backdrop-filter: blur(10px);
        }

        .edad-theme .chat-theme-edad [data-role="user"] {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(251, 191, 36, 0.9)) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 18px 18px 4px 18px !important;
        }

        /* Send button amber styling */
        .edad-theme button[type="submit"] {
          background: linear-gradient(135deg, rgb(245, 158, 11), rgb(251, 191, 36)) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4) !important;
        }

        .edad-theme button[type="submit"]:hover:not(:disabled) {
          background: linear-gradient(135deg, rgb(251, 191, 36), rgb(245, 158, 11)) !important;
          transform: translateY(-1px);
        }

        /* Input styling for edad */
        .edad-theme form {
          border: 1px solid rgba(245, 158, 11, 0.25) !important;
          border-radius: 16px !important;
          background: rgba(255, 255, 255, 0.03) !important;
        }

        .edad-theme form:focus-within {
          border-color: rgba(245, 158, 11, 0.5) !important;
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.15) !important;
        }

        /* Scrollbar for edad */
        .edad-theme ::-webkit-scrollbar-thumb {
          background: rgba(245, 158, 11, 0.3) !important;
        }

        .edad-theme ::-webkit-scrollbar-thumb:hover {
          background: rgba(245, 158, 11, 0.5) !important;
        }

        /* Voice button for edad */
        .edad-theme button[type="button"] {
          color: rgb(251, 191, 36) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
        }

        .edad-theme button[type="button"]:hover {
          background: rgba(245, 158, 11, 0.1) !important;
        }

        /* Romantic theme chat styles */
        ${isRomanticTheme
          ? `
          .chat-theme-romantic {
            background: transparent;
          }

          /* Agent message container */
          .chat-theme-romantic .flex.justify-start .flex-col.gap-1.max-w-\\[70\\%\\] {
            max-width: 75%;
          }

          /* Agent message bubble */
          .chat-theme-romantic .flex.justify-start .flex-col.gap-1 > div.py-1.rounded-none {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.08),
                        0 0 0 1px rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.05) !important;
            transition: all 0.2s ease;
          }

          /* Agent message hover */
          .chat-theme-romantic .flex.justify-start .flex-col.gap-1 > div.py-1.rounded-none:hover {
            background: rgba(255, 255, 255, 0.07) !important;
            border-color: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.25) !important;
          }

          /* User message container */
          .chat-theme-romantic .flex-col.gap-2.max-w-full {
            max-width: 75%;
            margin-left: auto;
          }

          /* User message bubble */
          .chat-theme-romantic .flex-col.gap-2.max-w-full > div.rounded-none {
            background: linear-gradient(135deg, rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.95), rgba(${theme.colors.primaryLight.replace(/ /g, ", ")}, 0.95)) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 18px 18px 4px 18px !important;
            padding: 14px 18px !important;
            box-shadow: 0 4px 16px rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            transition: all 0.2s ease;
          }

          /* Message text color */
          .chat-theme-romantic .flex.justify-start p[style*="color: #f2f2f2"],
          .chat-theme-romantic .flex-col.gap-2.max-w-full p[style*="color: #f2f2f2"] {
            color: #ffffff !important;
            line-height: 1.6 !important;
          }

          /* User avatar */
          .chat-theme-romantic .bg-\\[\\#FF5800\\] {
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ", ")}), rgb(${theme.colors.primaryLight.replace(/ /g, ", ")})) !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            box-shadow: 0 4px 12px rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.4);
          }

          /* Input form container */
          .chat-theme-romantic form[style*="backgroundColor"] {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.2) !important;
            border-radius: 20px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.08) !important;
            padding: 16px !important;
            margin-bottom: 20px !important;
          }

          /* Input form on focus */
          .chat-theme-romantic form[style*="backgroundColor"]:focus-within {
            border-color: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.4) !important;
          }

          /* Input textarea */
          .chat-theme-romantic textarea {
            background: transparent !important;
            color: white !important;
          }

          .chat-theme-romantic textarea::placeholder {
            color: rgba(255, 255, 255, 0.35) !important;
          }

          /* Send button */
          .chat-theme-romantic button[type="submit"]:not(.h-5):not(.w-5) {
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ", ")}), rgb(${theme.colors.primaryLight.replace(/ /g, ", ")})) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 12px rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            transition: all 0.2s ease;
            min-width: 120px !important;
            height: 44px !important;
            font-weight: 500 !important;
          }

          .chat-theme-romantic button[type="submit"]:not(.h-5):not(.w-5):hover:not(:disabled) {
            background: linear-gradient(135deg, rgb(${theme.colors.primaryLight.replace(/ /g, ", ")}), rgb(${theme.colors.primary.replace(/ /g, ", ")})) !important;
            transform: translateY(-2px);
          }

          .chat-theme-romantic button[type="submit"]:not(.h-5):not(.w-5):disabled {
            opacity: 0.4;
            box-shadow: none !important;
          }

          /* Voice/Mic button */
          .chat-theme-romantic button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]) {
            color: rgb(${theme.colors.primary.replace(/ /g, ", ")}) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.3) !important;
            border-radius: 12px !important;
            background: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.05) !important;
          }

          .chat-theme-romantic button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]):hover:not(:disabled) {
            background: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.15) !important;
            border-color: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.5) !important;
          }

          /* Thinking indicator */
          .chat-theme-romantic .flex.items-center.gap-3.py-2 {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
          }

          .chat-theme-romantic .animate-spin {
            color: rgb(${theme.colors.primary.replace(/ /g, ", ")}) !important;
          }

          /* Scrollbar */
          .chat-theme-romantic ::-webkit-scrollbar {
            width: 8px;
          }
          .chat-theme-romantic ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
          }
          .chat-theme-romantic ::-webkit-scrollbar-thumb {
            background: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.3);
            border-radius: 4px;
          }
          .chat-theme-romantic ::-webkit-scrollbar-thumb:hover {
            background: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.5);
          }

          /* Character name label */
          .chat-theme-romantic p[style*="color: rgb(161, 161, 170)"] {
            color: rgba(${theme.colors.primary.replace(/ /g, ", ")}, 0.8) !important;
            font-weight: 500 !important;
          }

          /* Switch toggles */
          .chat-theme-romantic [role="switch"][data-state="checked"] {
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ", ")}), rgb(${theme.colors.primaryLight.replace(/ /g, ", ")})) !important;
          }
        `
          : ""}
      `}</style>
    </div>
  );
}
