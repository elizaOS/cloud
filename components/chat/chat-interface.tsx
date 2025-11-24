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

/**
 * Chat Interface Component
 *
 * This is a wrapper component that:
 * 1. Shows free message count for anonymous users
 * 2. Displays signup prompts at appropriate times
 * 3. Enforces message limits
 * 4. Integrates with your existing Eliza chat system
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
}

export function ChatInterface({
  character,
  session,
  user,
  showSignupPrompt = false,
  source,
}: ChatInterfaceProps) {
  const router = useRouter();
  const [messageCount, setMessageCount] = useState(session?.messageCount || 0);
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

  useEffect(() => {
    // Track affiliate source
    if (source) {
      console.log(
        `[Analytics] User from ${source} started chatting with ${character.name}`
      );
      // TODO: Add actual analytics tracking here
    }
  }, [source, character.name]);

  const handleUpgrade = () => {
    toast.info("Redirecting to signup...");
    // Redirect to signup flow with migration
    router.push(
      `/login?redirect=/chat/${character.id}&session=${session?.token}`
    );
  };

  if (shouldShowPaywall) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">
              You've used all your free messages!
            </h2>
            <p className="text-muted-foreground">
              Sign up to continue chatting with {character.name} and unlock
              unlimited messages.
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
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top Banner - Free Message Counter */}
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
                      {messageCount}/{session?.messagesLimit}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>

              {shouldShowSoftPrompt && (
                <Button size="sm" variant="default" onClick={handleUpgrade}>
                  Unlock Unlimited
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Soft Signup Prompt */}
      {shouldShowSoftPrompt && (
        <Alert className="m-4 border-primary/50 bg-primary/5">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Enjoying your chat? Sign up now to save your conversation and get
            unlimited messages!
            <Button
              variant="link"
              size="sm"
              className="ml-2"
              onClick={handleUpgrade}
            >
              Sign Up →
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Chat Area - Integrated with ElizaChatInterface */}
      <div className="flex-1 overflow-hidden">
        <ElizaChatInterface />
      </div>
    </div>
  );
}
