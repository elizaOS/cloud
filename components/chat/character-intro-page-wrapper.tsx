"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MessageSquare } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";

interface CharacterIntroPageWrapperProps {
  character: UserCharacter;
  characterId: string;
  source?: string;
  theme: AffiliateTheme;
  existingSessionId?: string; // Session ID passed from affiliate redirect
}

export function CharacterIntroPageWrapper({
  character,
  characterId,
  source,
  theme,
  existingSessionId,
}: CharacterIntroPageWrapperProps) {
  const router = useRouter();

  // Extract bio text
  const bioText = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;

  // Handle "Start Chat" action - uses existing session or creates new one
  const handleStartChat = async () => {
    try {
      // If we already have a session from affiliate redirect, use it
      if (existingSessionId) {
        console.log("[IntroPage] Using existing session:", existingSessionId);
        router.push(
          `/chat/${characterId}?session=${existingSessionId}${source ? `&source=${source}` : ""}`
        );
        return;
      }

      // Create anonymous session via API for new visitors
      const res = await fetch("/api/affiliate/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          source: source || "direct",
        }),
      });

      if (res.ok) {
        const { sessionToken } = await res.json();
        // Navigate to chat with session token
        router.push(
          `/chat/${characterId}?session=${sessionToken}${source ? `&source=${source}` : ""}`
        );
      } else {
        // Fallback: navigate without session
        console.error("[IntroPage] Failed to create session, navigating anyway");
        router.push(`/chat/${characterId}${source ? `?source=${source}` : ""}`);
      }
    } catch (error) {
      console.error("[IntroPage] Error creating session:", error);
      router.push(`/chat/${characterId}${source ? `?source=${source}` : ""}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20">
      <Card className="max-w-md w-full shadow-lg border">
        <CardContent className="p-6 space-y-6">
          {/* Character Avatar */}
          <div className="flex flex-col items-center">
            {character.avatar_url ? (
              <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-primary/20 shadow-md">
                <Image
                  src={character.avatar_url}
                  alt={character.name}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">
                  {character.name.charAt(0)}
                </span>
              </div>
            )}

            {/* Character Name */}
            <h1 className="mt-4 text-2xl font-bold text-center">
              {character.name}
            </h1>

            {/* Badge */}
            <Badge variant="secondary" className="mt-2">
              AI Character
            </Badge>
          </div>

          {/* Bio */}
          <p className="text-center text-muted-foreground text-sm leading-relaxed">
            {bioText.length > 200 ? `${bioText.slice(0, 200)}...` : bioText}
          </p>

          {/* Features */}
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>Instant Chat</span>
            </div>
          </div>

          {/* CTA Button */}
          <Button
            size="lg"
            className="w-full"
            onClick={handleStartChat}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Start Chatting
          </Button>

          {/* Footer text */}
          <p className="text-xs text-center text-muted-foreground">
            10 free messages • No sign-up required
          </p>
        </CardContent>
      </Card>

      {/* Powered by branding */}
      <p className="mt-6 text-xs text-muted-foreground">
        Powered by {theme.branding.title}
      </p>
    </div>
  );
}


