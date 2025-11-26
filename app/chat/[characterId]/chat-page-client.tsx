"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { useChatStore } from "@/stores/chat-store";
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";

interface ChatPageClientProps {
  character: UserCharacter;
  sessionToken?: string;
  isAnonymous: boolean;
  messageCount?: number;
  messagesLimit?: number;
  source?: string;
  theme: AffiliateTheme;
}

export function ChatPageClient({
  character,
  sessionToken,
  isAnonymous,
  messageCount = 0,
  messagesLimit = 10,
  source,
  theme,
}: ChatPageClientProps) {
  const router = useRouter();
  const { setSelectedCharacterId } = useChatStore();
  const [localMessageCount, setLocalMessageCount] = useState(messageCount);
  
  const messagesRemaining = messagesLimit - localMessageCount;
  const progress = (localMessageCount / messagesLimit) * 100;
  const shouldShowSignupPrompt = isAnonymous && localMessageCount >= 5 && localMessageCount < messagesLimit;
  const isPaywalled = isAnonymous && messagesRemaining <= 0;

  // Set the selected character ID so ElizaChatInterface knows which character to use
  useEffect(() => {
    setSelectedCharacterId(character.id);
  }, [character.id, setSelectedCharacterId]);

  // Set anonymous session cookie if session token provided
  useEffect(() => {
    if (sessionToken && isAnonymous) {
      fetch("/api/set-anonymous-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      })
        .then((res) => {
          if (res.ok) {
            console.log("[ChatPageClient] ✅ Anonymous session cookie set");
          } else {
            console.error("[ChatPageClient] ❌ Failed to set session cookie");
          }
        })
        .catch((err) => {
          console.error("[ChatPageClient] ❌ Error setting session cookie:", err);
        });
    }
  }, [sessionToken, isAnonymous]);

  // Track source for analytics
  useEffect(() => {
    if (source) {
      console.log(`[ChatPageClient] Traffic from affiliate: ${source}`);
    }
  }, [source]);

  const handleUpgrade = () => {
    toast.info("Redirecting to signup...");
    router.push(`/login?redirect=/chat/${character.id}&session=${sessionToken}`);
  };

  // Paywall view
  if (isPaywalled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-md w-full p-8 text-center space-y-6 bg-card rounded-lg border shadow-lg">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">
              You&apos;ve used all your free messages!
            </h2>
            <p className="text-muted-foreground">
              Sign up to continue chatting with {character.name} and unlock unlimited messages.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="font-medium">What you get:</p>
            <ul className="text-sm text-left space-y-1 text-muted-foreground">
              <li>✅ Unlimited messages</li>
              <li>✅ Save your chat history</li>
              <li>✅ Access from any device</li>
              <li>✅ Create more characters</li>
            </ul>
          </div>

          <Button size="lg" className="w-full" onClick={handleUpgrade}>
            Sign Up Free
          </Button>

          <p className="text-xs text-muted-foreground">
            No credit card required
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Anonymous user banner with message count */}
      {isAnonymous && (
        <div className="border-b bg-muted/30 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Badge variant="secondary" className="shrink-0">
                  Free Trial
                </Badge>
                <div className="flex-1 max-w-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium">
                      {messagesRemaining} messages left
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {localMessageCount}/{messagesLimit}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {shouldShowSignupPrompt && (
                <Button size="sm" variant="default" onClick={handleUpgrade}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Unlock Unlimited
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signup prompt banner (5-9 messages) */}
      {shouldShowSignupPrompt && (
        <div className="border-b bg-primary/5">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3 text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>
                Enjoying your chat? Sign up now to save your conversation and get unlimited messages!
              </span>
              <Button
                variant="link"
                size="sm"
                className="ml-auto"
                onClick={handleUpgrade}
              >
                Sign Up →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Area - Uses existing ElizaChatInterface from dev branch */}
      <div className="flex-1 overflow-hidden">
        <ElizaChatInterface />
      </div>
    </div>
  );
}


