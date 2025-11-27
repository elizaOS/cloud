"use client";

import { useEffect, useState, useCallback } from "react";
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
  const router = useRouter();
  const { login } = usePrivy();
  const [messageCount, setMessageCount] = useState(session?.messageCount || 0);
  const [isLoadingSessionData, setIsLoadingSessionData] = useState(false);
  const { setSelectedCharacterId, setAnonymousSessionToken, loadRooms, rooms, setRoomId, roomId } = useChatStore();
  const isAnonymous = !user && !!session;
  const [isInitializingRoom, setIsInitializingRoom] = useState(false);
  
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
            console.log("[ChatInterface] ✅ Server session data:", {
              serverCount,
              currentLocalCount: messageCount,
              willUpdate: serverCount !== messageCount,
            });
            
            // Only update if server has a different (higher) count
            // This ensures we don't overwrite local increments that haven't synced yet
            if (serverCount > messageCount) {
              setMessageCount(serverCount);
              console.log("[ChatInterface] 📊 Updated message count from server:", serverCount);
            }
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
  
  // Callback to increment message count when a message is sent successfully
  // This is called from ElizaChatInterface after a successful message
  // DIRECTLY calls the increment API to ensure the count is persisted to the database
  const onMessageSent = useCallback(async () => {
    if (isAnonymous && sessionTokenFromUrl) {
      console.log("[ChatInterface] 📊 Message sent, incrementing count for token:", sessionTokenFromUrl.slice(0, 8) + "...");
      
      // DIRECTLY call the increment API to ensure the count is persisted
      // This bypasses any potential issues in the server-side auth flow
      try {
        const incrementResponse = await fetch("/api/anonymous-session/increment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
        });
        
        if (incrementResponse.ok) {
          const data = await incrementResponse.json();
          console.log("[ChatInterface] ✅ Server increment successful:", {
            previousCount: data.previousCount,
            newCount: data.newCount,
            messagesRemaining: data.messagesRemaining,
          });
          
          // Update local state with the server's confirmed count
          setMessageCount(data.newCount);
        } else {
          const errorData = await incrementResponse.json().catch(() => ({}));
          console.error("[ChatInterface] ❌ Server increment failed:", incrementResponse.status, errorData);
          
          // Fall back to local increment if server fails
          setMessageCount(prev => {
            const newCount = prev + 1;
            console.log("[ChatInterface] ⚠️ Falling back to local increment:", prev, "→", newCount);
            return newCount;
          });
        }
      } catch (error) {
        console.error("[ChatInterface] ❌ Error calling increment API:", error);
        
        // Fall back to local increment if request fails
        setMessageCount(prev => {
          const newCount = prev + 1;
          console.log("[ChatInterface] ⚠️ Falling back to local increment:", prev, "→", newCount);
          return newCount;
        });
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
  const isRomanticTheme = theme.variants.introCard === 'romantic';
  const showAnimatedBackground = theme.features.animatedBackground;

  // Get CSS variables for theming
  const themeStyles = getThemeCSSVariables(theme);

  // Convert RGB string to usable CSS color format
  const rgbToColor = (rgb: string) => `rgb(${rgb.replace(/ /g, ', ')})`;
  const rgbToColorAlpha = (rgb: string, alpha: number) => `rgba(${rgb.replace(/ /g, ', ')}, ${alpha})`;

  // Pre-computed theme colors for inline styles
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
  useEffect(() => {
    const initializeRoom = async () => {
      if (isInitializingRoom) return;
      
      // Get current entityId from store
      const currentEntityId = useChatStore.getState().entityId;
      console.log("[ChatInterface] 🔍 Room init check:", {
        roomId,
        characterId: character.id,
        entityId: currentEntityId,
        isInitializingRoom
      });
      
      // Only do this for users who don't have a room yet
      if (!roomId && character.id) {
        setIsInitializingRoom(true);
        console.log("[ChatInterface] 🔄 Initializing room for character:", character.id, "entityId:", currentEntityId);
        
        try {
          // Load rooms first
          await loadRooms(true); // Force refresh
          
          // Small delay to allow store to update
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Get the current rooms from store
          const currentRooms = useChatStore.getState().rooms;
          console.log("[ChatInterface] Loaded rooms:", currentRooms.length, "rooms:", currentRooms.map(r => ({ id: r.id, characterId: r.characterId })));
          
          // Find an existing room for this character
          const existingRoom = currentRooms.find(room => room.characterId === character.id);
          
          if (existingRoom) {
            console.log("[ChatInterface] ✅ Found existing room:", existingRoom.id);
            setRoomId(existingRoom.id);
          } else {
            console.log("[ChatInterface] No existing room found for character:", character.id, "in rooms:", currentRooms.map(r => r.characterId));
          }
        } catch (error) {
          console.error("[ChatInterface] Error initializing room:", error);
        } finally {
          setIsInitializingRoom(false);
        }
      }
    };
    
    initializeRoom();
  }, [character.id, roomId, loadRooms, setRoomId, isInitializingRoom]);

  // CRITICAL: Set anonymous session cookie if session token is in URL (for affiliate users)
  // This ensures the cookie is set even if we're not sure about auth state yet
  useEffect(() => {
    // Only set cookie if we have a session token AND user is NOT authenticated
    // (authenticated users don't need the anonymous session cookie)
    if (sessionTokenFromUrl && !user) {
      console.log("[ChatInterface] Setting anonymous session cookie from URL:", sessionTokenFromUrl.slice(0, 8) + "...");
      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
      })
        .then(async (res) => {
          if (res.ok) {
            console.log("[ChatInterface] ✅ Anonymous session cookie set successfully");
          } else {
            const errorData = await res.json().catch(() => ({}));
            console.error("[ChatInterface] ❌ Failed to set session cookie:", res.status, errorData);
          }
        })
        .catch((err) => {
          console.error("[ChatInterface] ❌ Error setting session cookie:", err);
        });
    }
  }, [sessionTokenFromUrl, user]);

  useEffect(() => {
    // Track affiliate source
    if (source) {
      console.log(
        `[Analytics] User from ${source} started chatting with ${character.name}`
      );
    }
  }, [source, character.name]);

  const handleUpgrade = () => {
    toast.info("Redirecting to signup...");
    router.push(
      `/login?redirect=/chat/${character.id}&session=${session?.token}`
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
        style={{
          ...themeStyles,
          ...(isRomanticTheme && themeColors ? {
            background: `black radial-gradient(ellipse at top, ${themeColors.primaryAlpha15}, transparent 50%), radial-gradient(ellipse at bottom, ${themeColors.accentAlpha10}, transparent 50%)`,
          } : {}),
        }}
        className={`min-h-screen flex items-center justify-center p-4 themed-chat ${
          isRomanticTheme ? 'bg-black' : 'bg-gradient-to-b from-background to-muted/20'
        }`}
      >
        <Card 
          className={`max-w-md w-full p-8 text-center space-y-6 ${isRomanticTheme ? 'backdrop-blur-sm' : ''}`}
          style={isRomanticTheme && themeColors ? {
            background: 'rgba(255, 255, 255, 0.05)',
            borderColor: themeColors.primaryAlpha30,
          } : {}}
        >
          <div className="flex justify-center">
            <div 
              className={`rounded-full p-4 ${isRomanticTheme ? '' : 'bg-primary/10'}`}
              style={isRomanticTheme && themeColors ? { background: themeColors.primaryAlpha20 } : {}}
            >
              <InfoIcon 
                className={`w-8 h-8 ${isRomanticTheme ? '' : 'text-primary'}`}
                style={isRomanticTheme && themeColors ? { color: themeColors.primaryLight } : {}}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className={`text-2xl font-bold ${isRomanticTheme ? 'text-white' : ''}`}>
              You've reached your free message limit
            </h2>
            <p className={isRomanticTheme ? 'text-white/70' : 'text-muted-foreground'}>
              Sign up for free to continue chatting with {character.name}
            </p>
          </div>

          <div 
            className={`rounded-lg p-4 space-y-2 ${isRomanticTheme ? '' : 'bg-muted/50'}`}
            style={isRomanticTheme ? { background: 'rgba(255, 255, 255, 0.05)' } : {}}
          >
            <p className={`font-medium ${isRomanticTheme ? 'text-white' : ''}`}>What you get:</p>
            <ul className={`text-sm text-left space-y-1 ${
              isRomanticTheme ? 'text-white/70' : 'text-muted-foreground'
            }`}>
              <li>✅ Unlimited messages</li>
              <li>✅ Save your chat history</li>
              <li>✅ Access from any device</li>
              <li>✅ Create more characters</li>
            </ul>
          </div>

          <Button 
            size="lg" 
            className="w-full text-white"
            style={isRomanticTheme && themeColors ? {
              background: themeColors.gradient,
              boxShadow: `0 4px 12px ${themeColors.primaryAlpha30}`,
            } : {}}
            onClick={handleUpgrade}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Sign Up Free
          </Button>

          <p className={`text-xs ${isRomanticTheme ? 'text-white/50' : 'text-muted-foreground'}`}>
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
      className={`h-screen flex flex-col themed-chat ${isRomanticTheme ? 'romantic-theme bg-black' : ''}`}
    >
      {/* Animated background for romantic theme */}
      {showAnimatedBackground && themeColors && (
        <div className="fixed inset-0 -z-10">
          <div 
            className="absolute inset-0 animate-pulse" 
            style={{ 
              background: `radial-gradient(ellipse at center, ${rgbToColorAlpha(theme.colors.primary, 0.08)}, transparent 70%)`,
              animationDuration: "4s",
            }} 
          />
        </div>
      )}

      {/* Free messages banner (anonymous only) */}
      {isAnonymous && !shouldShowPaywall && (
        <div 
          className={`border-b backdrop-blur-sm ${isRomanticTheme ? 'border-white/10' : 'bg-muted/30'}`}
          style={isRomanticTheme ? { background: 'rgba(255, 255, 255, 0.02)' } : {}}
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge 
                  variant="secondary" 
                  style={isRomanticTheme && themeColors ? {
                    background: themeColors.primaryAlpha10,
                    color: themeColors.primaryLight,
                    borderColor: themeColors.primaryAlpha20,
                  } : {}}
                >
                  {messagesRemaining} messages left
                </Badge>
                <div 
                  className={`w-32 h-2 rounded-full overflow-hidden ${isRomanticTheme ? '' : 'bg-muted'}`}
                  style={isRomanticTheme ? { background: 'rgba(255, 255, 255, 0.1)' } : {}}
                >
                  <div 
                    className={`h-full transition-all duration-300 ${isRomanticTheme ? '' : 'bg-primary'}`}
                    style={{ 
                      width: `${progress}%`,
                      ...(isRomanticTheme && themeColors ? { background: themeColors.gradient } : {}),
                    }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={isRomanticTheme ? handleSignup : handleUpgrade}
                style={isRomanticTheme && themeColors ? {
                  borderColor: themeColors.primaryAlpha30,
                  color: themeColors.primaryLight,
                } : {}}
                className={isRomanticTheme ? 'hover:bg-pink-600/10' : ''}
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
          className="border-b backdrop-blur-sm"
          style={isRomanticTheme && themeColors ? {
            borderColor: themeColors.primaryAlpha20,
            background: `linear-gradient(to right, ${themeColors.primaryAlpha10}, ${themeColors.accentAlpha10})`,
          } : {}}
        >
          <div className="container mx-auto px-4 py-3">
            <Alert 
              className={isRomanticTheme ? 'bg-transparent' : 'border-primary/50 bg-primary/5'}
              style={isRomanticTheme && themeColors ? { borderColor: themeColors.primaryAlpha30 } : {}}
            >
              <Sparkles 
                className="h-4 w-4"
                style={isRomanticTheme && themeColors ? { color: themeColors.primaryLight } : {}}
              />
              <AlertDescription className={isRomanticTheme ? 'text-white/80' : ''}>
                Enjoying the conversation? Sign up for free to get unlimited messages and save your chat history.
                <Button
                  size="sm"
                  variant="link"
                  onClick={isRomanticTheme ? handleSignup : handleUpgrade}
                  style={isRomanticTheme && themeColors ? { color: themeColors.primaryLight } : {}}
                  className="ml-2"
                >
                  Sign up free →
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Chat interface with theme styling */}
      <div className={`flex-1 overflow-hidden ${isRomanticTheme ? 'chat-theme-romantic' : ''}`}>
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
      `}</style>
    </div>
  );
}
