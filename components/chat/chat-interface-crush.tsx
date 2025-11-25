"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { InfoIcon, Sparkles } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import { ElizaChatInterface } from "./eliza-chat-interface";
import { useChatStore } from "@/stores/chat-store";

/**
 * Clone Your Crush themed Chat Interface
 * 
 * Same functionality as ChatInterface but with pink/gradient theme matching landing page
 */

interface ChatInterfaceCrushProps {
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
}

export function ChatInterfaceCrush({
  character,
  session,
  user,
  showSignupPrompt = false,
  source,
  sessionTokenFromUrl,
}: ChatInterfaceCrushProps) {
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

  // Set the selected character ID
  useEffect(() => {
    setSelectedCharacterId(character.id);
  }, [character.id, setSelectedCharacterId]);

  // Set anonymous session cookie if session token is in URL
  useEffect(() => {
    if (sessionTokenFromUrl && isAnonymous) {
      console.log("[ChatInterfaceCrush] Setting anonymous session cookie from URL");
      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionTokenFromUrl }),
      })
        .then((res) => {
          if (res.ok) {
            console.log("[ChatInterfaceCrush] ✅ Anonymous session cookie set successfully");
          } else {
            console.error("[ChatInterfaceCrush] ❌ Failed to set session cookie:", res.status);
          }
        })
        .catch((err) => {
          console.error("[ChatInterfaceCrush] ❌ Error setting session cookie:", err);
        });
    }
  }, [sessionTokenFromUrl, isAnonymous]);

  useEffect(() => {
    // Track affiliate source
    if (source) {
      console.log(
        `[ChatInterfaceCrush] Character from affiliate: ${source}. User type: ${user ? "authenticated" : "anonymous"}`
      );
    }
  }, [source, user]);

  const handleSignup = () => {
    toast.info("Opening signup modal...");
    // Privy modal will open automatically
  };

  // Pink themed background with romantic aesthetics
  return (
    <div className="h-screen flex flex-col bg-black bg-[radial-gradient(ellipse_at_top,rgba(219,39,119,0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(147,51,234,0.1),transparent_50%)]">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(219,39,119,0.08),transparent_70%)] animate-pulse" style={{ animationDuration: "4s" }} />
      </div>

      {/* Free messages banner (anonymous only) */}
      {isAnonymous && !shouldShowPaywall && (
        <div className="border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-pink-500/10 text-pink-400 border-pink-500/20">
                  {messagesRemaining} messages left
                </Badge>
                <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-pink-500 to-pink-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSignup}
                className="border-pink-500/30 text-pink-400 hover:bg-pink-500/10 hover:text-pink-300"
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
        <div className="border-b border-pink-500/20 bg-gradient-to-r from-pink-500/10 to-purple-500/10 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3">
            <Alert className="border-pink-500/30 bg-transparent">
              <Sparkles className="h-4 w-4 text-pink-400" />
              <AlertDescription className="text-white/80">
                Enjoying the conversation? Sign up for free to get unlimited messages and save your chat history.
                <Button
                  size="sm"
                  variant="link"
                  onClick={handleSignup}
                  className="ml-2 text-pink-400 hover:text-pink-300"
                >
                  Sign up free →
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Paywall (10 messages reached) */}
      {shouldShowPaywall && (
        <div className="border-b border-pink-500/20 bg-gradient-to-r from-pink-600/20 to-purple-600/20 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <Card className="bg-white/[0.05] border-pink-500/30 backdrop-blur-sm">
              <div className="p-6 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pink-500/20 mb-2">
                  <InfoIcon className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">
                  You've reached your free message limit
                </h3>
                <p className="text-white/70">
                  Sign up for free to continue chatting with {character.name}
                </p>
                <Button
                  size="lg"
                  onClick={handleSignup}
                  className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500 text-white shadow-lg shadow-pink-500/30"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Sign Up Free
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Chat interface with romantic pink theme */}
      <div className="flex-1 overflow-hidden crush-chat-theme">
        <style jsx global>{`
          /* Pink/Romantic theme for Clone Your Crush chat */
          .crush-chat-theme {
            background: transparent;
          }
          
          /* Agent message container - Add proper spacing */
          .crush-chat-theme .flex.justify-start .flex-col.gap-1.max-w-\\[70\\%\\] {
            max-width: 75%;
          }
          
          /* Agent message bubble - Target the actual message text container */
          .crush-chat-theme .flex.justify-start .flex-col.gap-1 > div.py-1.rounded-none {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(236, 72, 153, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 
                        inset 0 1px 0 rgba(236, 72, 153, 0.08),
                        0 0 0 1px rgba(236, 72, 153, 0.05) !important;
            transition: all 0.2s ease;
          }
          
          /* Agent message hover effect */
          .crush-chat-theme .flex.justify-start .flex-col.gap-1 > div.py-1.rounded-none:hover {
            background: rgba(255, 255, 255, 0.07) !important;
            border-color: rgba(236, 72, 153, 0.25) !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 
                        inset 0 1px 0 rgba(236, 72, 153, 0.12),
                        0 0 0 1px rgba(236, 72, 153, 0.08) !important;
          }
          
          /* User message container */
          .crush-chat-theme .flex-col.gap-2.max-w-full {
            max-width: 75%;
            margin-left: auto;
          }
          
          /* User message bubble - Target the message text div */
          .crush-chat-theme .flex-col.gap-2.max-w-full > div.rounded-none {
            background: linear-gradient(135deg, rgba(236, 72, 153, 0.95), rgba(219, 39, 119, 0.95)) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 18px 18px 4px 18px !important;
            padding: 14px 18px !important;
            box-shadow: 0 4px 16px rgba(236, 72, 153, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            backdrop-filter: blur(12px);
            transition: all 0.2s ease;
          }
          
          /* User message hover effect */
          .crush-chat-theme .flex-col.gap-2.max-w-full > div.rounded-none:hover {
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(236, 72, 153, 0.95)) !important;
            box-shadow: 0 6px 20px rgba(236, 72, 153, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
            transform: translateY(-1px);
          }
          
          /* Message text color for both agent and user */
          .crush-chat-theme .flex.justify-start p[style*="color: #f2f2f2"],
          .crush-chat-theme .flex-col.gap-2.max-w-full p[style*="color: #f2f2f2"] {
            color: #ffffff !important;
            line-height: 1.6 !important;
          }
          
          /* User avatar */
          .crush-chat-theme .bg-\\[\\#FF5800\\] {
            background: linear-gradient(135deg, rgba(236, 72, 153, 1), rgba(219, 39, 119, 1)) !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            box-shadow: 0 4px 12px rgba(236, 72, 153, 0.4);
          }
          
          /* Input form container */
          .crush-chat-theme form[style*="backgroundColor"] {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(236, 72, 153, 0.2) !important;
            border-radius: 20px !important;
            backdrop-filter: blur(16px);
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(236, 72, 153, 0.08) !important;
            padding: 16px !important;
            margin-bottom: 20px !important;
          }
          
          /* Input form on focus */
          .crush-chat-theme form[style*="backgroundColor"]:focus-within {
            border-color: rgba(236, 72, 153, 0.4) !important;
            box-shadow: 0 4px 16px rgba(236, 72, 153, 0.2),
                        inset 0 1px 0 rgba(236, 72, 153, 0.12) !important;
          }
          
          /* Input textarea */
          .crush-chat-theme textarea {
            background: transparent !important;
            color: white !important;
            padding: 8px 0 !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
          }
          
          .crush-chat-theme textarea::placeholder {
            color: rgba(255, 255, 255, 0.35) !important;
          }
          
          /* Send button */
          .crush-chat-theme button[type="submit"]:not(.h-5):not(.w-5) {
            background: linear-gradient(135deg, rgba(236, 72, 153, 1), rgba(219, 39, 119, 1)) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
            transition: all 0.2s ease;
            min-width: 120px !important;
            height: 44px !important;
            font-weight: 500 !important;
          }
          
          .crush-chat-theme button[type="submit"]:not(.h-5):not(.w-5):hover:not(:disabled) {
            background: linear-gradient(135deg, rgba(244, 114, 182, 1), rgba(236, 72, 153, 1)) !important;
            box-shadow: 0 6px 16px rgba(236, 72, 153, 0.45),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
            transform: translateY(-2px);
          }
          
          .crush-chat-theme button[type="submit"]:not(.h-5):not(.w-5):disabled {
            opacity: 0.4;
            box-shadow: none !important;
            transform: none !important;
          }
          
          /* Voice/Mic button */
          .crush-chat-theme button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]) {
            color: rgba(236, 72, 153, 1) !important;
            border: 1px solid rgba(236, 72, 153, 0.3) !important;
            border-radius: 12px !important;
            transition: all 0.2s ease;
            background: rgba(236, 72, 153, 0.05) !important;
          }
          
          .crush-chat-theme button[type="button"]:not(.h-5):not(.w-5):not([class*="dropdown"]):hover:not(:disabled) {
            background: rgba(236, 72, 153, 0.15) !important;
            border-color: rgba(236, 72, 153, 0.5) !important;
            color: rgba(244, 114, 182, 1) !important;
            box-shadow: 0 2px 8px rgba(236, 72, 153, 0.2) !important;
          }
          
          /* Message spacing */
          .crush-chat-theme .space-y-5 {
            gap: 24px !important;
            display: flex;
            flex-direction: column;
          }
          
          /* Thinking indicator */
          .crush-chat-theme .flex.items-center.gap-3.py-2 {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(236, 72, 153, 0.15) !important;
            border-radius: 18px 18px 18px 4px !important;
            padding: 14px 18px !important;
            backdrop-filter: blur(16px);
          }
          
          /* Thinking spinner color */
          .crush-chat-theme .animate-spin {
            color: rgba(236, 72, 153, 1) !important;
          }
          
          /* Image attachments */
          .crush-chat-theme .border.border-white\\/10.rounded-lg {
            border-color: rgba(236, 72, 153, 0.2) !important;
            border-radius: 12px !important;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }
          
          /* Visor scanner animation - Pink theme */
          .crush-chat-theme .absolute.h-full.w-20 {
            background: linear-gradient(to right, transparent, rgba(236, 72, 153, 0.8), transparent) !important;
            box-shadow: 0 0 10px 2px rgba(236, 72, 153, 0.6) !important;
          }
          
          .crush-chat-theme .absolute.h-full.w-16 {
            background: linear-gradient(to right, transparent, rgba(236, 72, 153, 0.5), transparent) !important;
            box-shadow: 0 0 8px 2px rgba(236, 72, 153, 0.4) !important;
          }
          
          /* Themed scrollbar */
          .crush-chat-theme ::-webkit-scrollbar {
            width: 8px;
          }
          .crush-chat-theme ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
          }
          .crush-chat-theme ::-webkit-scrollbar-thumb {
            background: rgba(236, 72, 153, 0.3);
            border-radius: 4px;
          }
          .crush-chat-theme ::-webkit-scrollbar-thumb:hover {
            background: rgba(236, 72, 153, 0.5);
          }
          
          /* Action buttons container - better spacing */
          .crush-chat-theme .flex.items-center.gap-2 {
            margin-top: 8px;
          }
          
          /* Copy buttons and action icons */
          .crush-chat-theme button.h-5.w-5 {
            color: rgba(255, 255, 255, 0.5) !important;
            transition: all 0.2s ease;
            border-radius: 6px !important;
          }
          
          .crush-chat-theme button.h-5.w-5:hover {
            color: rgba(236, 72, 153, 1) !important;
            background: rgba(236, 72, 153, 0.15) !important;
          }
          
          /* Empty state and loading */
          .crush-chat-theme .text-muted-foreground {
            color: rgba(255, 255, 255, 0.55) !important;
          }
          
          /* Character name label */
          .crush-chat-theme p[style*="color: rgb(161, 161, 170)"] {
            color: rgba(236, 72, 153, 0.8) !important;
            font-weight: 500 !important;
          }
          
          /* Timestamp labels */
          .crush-chat-theme p[style*="fontSize: 12px"][style*="color: rgb(161, 161, 170)"] {
            color: rgba(255, 255, 255, 0.4) !important;
            font-size: 11px !important;
          }
          
          /* Settings/options dropdown */
          .crush-chat-theme [role="menuitem"] {
            transition: all 0.2s ease;
          }
          
          .crush-chat-theme [role="menuitem"]:hover {
            background: rgba(236, 72, 153, 0.1) !important;
            color: rgba(236, 72, 153, 1) !important;
          }
          
          /* Switch toggles */
          .crush-chat-theme [role="switch"][data-state="checked"] {
            background: linear-gradient(135deg, rgba(236, 72, 153, 1), rgba(219, 39, 119, 1)) !important;
          }
          
          /* Main chat container padding */
          .crush-chat-theme .flex.flex-col.flex-1.min-h-0.w-full.px-6 {
            padding-left: 32px !important;
            padding-right: 32px !important;
          }
          
          /* Messages container */
          .crush-chat-theme .min-h-full.flex.flex-col.justify-end.px-32.py-4 {
            padding-left: 64px !important;
            padding-right: 64px !important;
            padding-top: 24px !important;
            padding-bottom: 24px !important;
          }
          
          /* Avatar styling */
          .crush-chat-theme .flex-shrink-0.w-4.h-4.rounded-full img,
          .crush-chat-theme .flex-shrink-0.w-4.h-4.rounded-full {
            border: 1.5px solid rgba(236, 72, 153, 0.3);
            box-shadow: 0 2px 6px rgba(236, 72, 153, 0.2);
          }
          
          /* User name in user messages */
          .crush-chat-theme .flex-col.gap-2.max-w-full p[style*="opacity: 0.8"] {
            color: rgba(236, 72, 153, 0.9) !important;
            font-weight: 500 !important;
          }
          
          /* Error messages */
          .crush-chat-theme .border-destructive {
            border-color: rgba(236, 72, 153, 0.4) !important;
            background: rgba(236, 72, 153, 0.08) !important;
          }
          
          /* Loading state */
          .crush-chat-theme .flex.flex-col.items-center.justify-center.h-full {
            color: rgba(236, 72, 153, 0.8);
          }
        `}</style>
        <ElizaChatInterface />
      </div>
    </div>
  );
}



