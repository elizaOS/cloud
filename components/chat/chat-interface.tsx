"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [messageCount, setMessageCount] = useState(session?.messageCount || 0);
  const { setSelectedCharacterId } = useChatStore();
  const isAnonymous = !user && !!session;
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

  // CRITICAL: Set the selected character ID so ElizaChatInterface knows which character to use
  useEffect(() => {
    setSelectedCharacterId(character.id);
  }, [character.id, setSelectedCharacterId]);

  // CRITICAL: Set anonymous session cookie if session token is in URL (for affiliate users)
  useEffect(() => {
    if (sessionTokenFromUrl && isAnonymous) {
      console.log("[ChatInterface] Setting anonymous session cookie from URL");
      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
      })
        .then((res) => {
          if (res.ok) {
            console.log("[ChatInterface] ✅ Anonymous session cookie set successfully");
          } else {
            console.error("[ChatInterface] ❌ Failed to set session cookie:", res.status);
          }
        })
        .catch((err) => {
          console.error("[ChatInterface] ❌ Error setting session cookie:", err);
        });
    }
  }, [sessionTokenFromUrl, isAnonymous]);

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

  const handleSignup = () => {
    toast.info("Opening signup modal...");
    // Privy modal will open automatically when implemented
  };

  // Paywall view with theme support
  if (shouldShowPaywall) {
    return (
      <div 
        style={themeStyles}
        className={`min-h-screen flex items-center justify-center p-4 themed-chat ${
          isRomanticTheme
            ? 'bg-black bg-[radial-gradient(ellipse_at_top,rgba(var(--theme-primary),0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent),0.1),transparent_50%)]'
            : 'bg-gradient-to-b from-background to-muted/20'
        }`}
      >
        <Card className={`max-w-md w-full p-8 text-center space-y-6 ${
          isRomanticTheme 
            ? 'bg-white/[0.05] border-[rgba(var(--theme-primary),0.3)] backdrop-blur-sm'
            : ''
        }`}>
          <div className="flex justify-center">
            <div className={`rounded-full p-4 ${
              isRomanticTheme
                ? 'bg-[rgba(var(--theme-primary),0.2)]'
                : 'bg-primary/10'
            }`}>
              <InfoIcon className={`w-8 h-8 ${
                isRomanticTheme ? 'text-[rgb(var(--theme-primary-light))]' : 'text-primary'
              }`} />
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

          <div className={`rounded-lg p-4 space-y-2 ${
            isRomanticTheme ? 'bg-white/[0.05]' : 'bg-muted/50'
          }`}>
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
            className={`w-full ${
              isRomanticTheme
                ? 'bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-gradient-to))] hover:from-[rgb(var(--theme-primary-light))] hover:to-[rgb(var(--theme-primary))] text-white shadow-lg shadow-[rgba(var(--theme-primary),0.3)]'
                : ''
            }`}
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
      className={`h-screen flex flex-col themed-chat ${
        isRomanticTheme
          ? 'bg-black bg-[radial-gradient(ellipse_at_top,rgba(var(--theme-primary),0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent),0.1),transparent_50%)]'
          : ''
      }`}
    >
      {/* Animated background for romantic theme */}
      {showAnimatedBackground && (
        <div className="fixed inset-0 -z-10">
          <div 
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-primary),0.08),transparent_70%)] animate-pulse" 
            style={{ animationDuration: "4s" }} 
          />
        </div>
      )}

      {/* Free messages banner (anonymous only) */}
      {isAnonymous && !shouldShowPaywall && (
        <div className={`border-b backdrop-blur-sm ${
          isRomanticTheme 
            ? 'border-white/10 bg-white/[0.02]'
            : 'bg-muted/30'
        }`}>
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge 
                  variant="secondary" 
                  className={
                    isRomanticTheme
                      ? 'bg-[rgba(var(--theme-primary),0.1)] text-[rgb(var(--theme-primary-light))] border-[rgba(var(--theme-primary),0.2)]'
                      : ''
                  }
                >
                  {messagesRemaining} messages left
                </Badge>
                <div className={`w-32 h-2 rounded-full overflow-hidden ${
                  isRomanticTheme ? 'bg-white/10' : 'bg-muted'
                }`}>
                  <div 
                    className={`h-full transition-all duration-300 ${
                      isRomanticTheme
                        ? 'bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-gradient-to))]'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={isRomanticTheme ? handleSignup : handleUpgrade}
                className={
                  isRomanticTheme
                    ? 'border-[rgba(var(--theme-primary),0.3)] text-[rgb(var(--theme-primary-light))] hover:bg-[rgba(var(--theme-primary),0.1)] hover:text-[rgb(var(--theme-primary-light))]'
                    : ''
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
        <div className={`border-b backdrop-blur-sm ${
          isRomanticTheme
            ? 'border-[rgba(var(--theme-primary),0.2)] bg-gradient-to-r from-[rgba(var(--theme-primary),0.1)] to-[rgba(var(--theme-accent),0.1)]'
            : ''
        }`}>
          <div className="container mx-auto px-4 py-3">
            <Alert className={
              isRomanticTheme
                ? 'border-[rgba(var(--theme-primary),0.3)] bg-transparent'
                : 'border-primary/50 bg-primary/5'
            }>
              <Sparkles className={`h-4 w-4 ${
                isRomanticTheme ? 'text-[rgb(var(--theme-primary-light))]' : ''
              }`} />
              <AlertDescription className={isRomanticTheme ? 'text-white/80' : ''}>
                Enjoying the conversation? Sign up for free to get unlimited messages and save your chat history.
                <Button
                  size="sm"
                  variant="link"
                  onClick={isRomanticTheme ? handleSignup : handleUpgrade}
                  className={`ml-2 ${
                    isRomanticTheme 
                      ? 'text-[rgb(var(--theme-primary-light))] hover:text-[rgb(var(--theme-primary-light))]'
                      : ''
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
      <div className={`flex-1 overflow-hidden ${isRomanticTheme ? 'chat-theme-romantic' : ''}`}>
        <ElizaChatInterface />
      </div>

      {/* Theme CSS Variables and Romantic Theme Styles */}
      <style jsx global>{`
        .themed-chat {
          --theme-primary: ${theme.colors.primary};
          --theme-primary-light: ${theme.colors.primaryLight};
          --theme-accent: ${theme.colors.accent};
          --theme-gradient-from: ${theme.colors.gradientFrom};
          --theme-gradient-to: ${theme.colors.gradientTo};
        }

        /* Romantic theme chat styles */
        ${isRomanticTheme ? `
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
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 
                        inset 0 1px 0 rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.08),
                        0 0 0 1px rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.05) !important;
            transition: all 0.2s ease;
          }
          
          /* Agent message hover */
          .chat-theme-romantic .flex.justify-start .flex-col.gap-1 > div.py-1.rounded-none:hover {
            background: rgba(255, 255, 255, 0.07) !important;
            border-color: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.25) !important;
          }
          
          /* User message container */
          .chat-theme-romantic .flex-col.gap-2.max-w-full {
            max-width: 75%;
            margin-left: auto;
          }
          
          /* User message bubble */
          .chat-theme-romantic .flex-col.gap-2.max-w-full > div.rounded-none {
            background: linear-gradient(135deg, rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.95), rgba(${theme.colors.primaryLight.replace(/ /g, ', ')}, 0.95)) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 18px 18px 4px 18px !important;
            padding: 14px 18px !important;
            box-shadow: 0 4px 16px rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.4),
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
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ', ')}), rgb(${theme.colors.primaryLight.replace(/ /g, ', ')})) !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            box-shadow: 0 4px 12px rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.4);
          }
          
          /* Input form container */
          .chat-theme-romantic form[style*="backgroundColor"] {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.2) !important;
            border-radius: 20px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.08) !important;
            padding: 16px !important;
            margin-bottom: 20px !important;
          }
          
          /* Input form on focus */
          .chat-theme-romantic form[style*="backgroundColor"]:focus-within {
            border-color: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.4) !important;
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
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ', ')}), rgb(${theme.colors.primaryLight.replace(/ /g, ', ')})) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 12px rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            transition: all 0.2s ease;
            min-width: 120px !important;
            height: 44px !important;
            font-weight: 500 !important;
          }
          
          .chat-theme-romantic button[type="submit"]:not(.h-5):not(.w-5):hover:not(:disabled) {
            background: linear-gradient(135deg, rgb(${theme.colors.primaryLight.replace(/ /g, ', ')}), rgb(${theme.colors.primary.replace(/ /g, ', ')})) !important;
            transform: translateY(-2px);
          }
          
          .chat-theme-romantic button[type="submit"]:not(.h-5):not(.w-5):disabled {
            opacity: 0.4;
            box-shadow: none !important;
          }
          
          /* Voice/Mic button */
          .chat-theme-romantic button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]) {
            color: rgb(${theme.colors.primary.replace(/ /g, ', ')}) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.3) !important;
            border-radius: 12px !important;
            background: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.05) !important;
          }
          
          .chat-theme-romantic button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]):hover:not(:disabled) {
            background: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.15) !important;
            border-color: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.5) !important;
          }
          
          /* Thinking indicator */
          .chat-theme-romantic .flex.items-center.gap-3.py-2 {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
          }
          
          .chat-theme-romantic .animate-spin {
            color: rgb(${theme.colors.primary.replace(/ /g, ', ')}) !important;
          }
          
          /* Scrollbar */
          .chat-theme-romantic ::-webkit-scrollbar {
            width: 8px;
          }
          .chat-theme-romantic ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
          }
          .chat-theme-romantic ::-webkit-scrollbar-thumb {
            background: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.3);
            border-radius: 4px;
          }
          .chat-theme-romantic ::-webkit-scrollbar-thumb:hover {
            background: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.5);
          }
          
          /* Character name label */
          .chat-theme-romantic p[style*="color: rgb(161, 161, 170)"] {
            color: rgba(${theme.colors.primary.replace(/ /g, ', ')}, 0.8) !important;
            font-weight: 500 !important;
          }
          
          /* Switch toggles */
          .chat-theme-romantic [role="switch"][data-state="checked"] {
            background: linear-gradient(135deg, rgb(${theme.colors.primary.replace(/ /g, ', ')}), rgb(${theme.colors.primaryLight.replace(/ /g, ', ')})) !important;
          }
        ` : ''}
      `}</style>
    </div>
  );
}
