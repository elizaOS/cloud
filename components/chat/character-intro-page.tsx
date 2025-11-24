"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, MessageCircle, Lock, CheckCircle } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import { EmailCaptureModal } from "./email-capture-modal";
import { motion } from "motion/react";

interface CharacterIntroPageProps {
  character: UserCharacter;
  onEmailSubmit: (email: string) => Promise<void>;
  onSkip: () => void;
  source?: string;
}

export function CharacterIntroPage({ 
  character, 
  onEmailSubmit, 
  onSkip,
  source 
}: CharacterIntroPageProps) {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Extract bio text
  const bioText = Array.isArray(character.bio) 
    ? character.bio.join(" ") 
    : character.bio;

  // Get vibe from character metadata
  const vibe = (character.character_data as Record<string, unknown>)?.affiliate as Record<string, unknown>;
  const vibeLabel = vibe?.vibe as string | undefined;

  const handleStartChat = () => {
    setShowEmailModal(true);
  };

  const handleEmailSubmit = async (email: string) => {
    setIsLoading(true);
    try {
      await onEmailSubmit(email);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    setShowEmailModal(false);
    onSkip();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            {source && (
              <Badge variant="secondary" className="mb-4">
                Created via {source}
              </Badge>
            )}
            <h1 className="text-4xl font-bold mb-2">Meet Your AI Companion</h1>
            <p className="text-muted-foreground">
              Your personalized character is ready to chat
            </p>
          </div>

          {/* Character Card */}
          <Card className="mb-8 overflow-hidden border-2">
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  <Avatar className="h-32 w-32 border-4 border-primary/20">
                    <AvatarImage src={character.avatar_url || undefined} />
                    <AvatarFallback className="text-4xl bg-gradient-to-br from-primary/20 to-primary/10">
                      {character.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>

                {/* Name and Vibe */}
                <div>
                  <h2 className="text-3xl font-bold mb-2">{character.name}</h2>
                  {vibeLabel && (
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      <Sparkles className="w-4 h-4 mr-2" />
                      {vibeLabel.charAt(0).toUpperCase() + vibeLabel.slice(1)}
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                  {bioText}
                </p>

                {/* CTA Button */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.3 }}
                  className="w-full max-w-md space-y-4 mt-6"
                >
                  <Button
                    size="lg"
                    className="w-full text-lg h-14 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={handleStartChat}
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Start Chatting (Free)
                  </Button>
                  
                  <p className="text-sm text-muted-foreground">
                    No credit card required • 10 free messages
                  </p>
                </motion.div>
              </div>
            </CardContent>
          </Card>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="grid md:grid-cols-3 gap-4 mb-8"
          >
            <Card>
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Personalized</h3>
                <p className="text-sm text-muted-foreground">
                  AI that matches your chosen personality
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Natural Chat</h3>
                <p className="text-sm text-muted-foreground">
                  Conversations that feel real and engaging
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Private</h3>
                <p className="text-sm text-muted-foreground">
                  Your conversations stay between you and your AI
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* How It Works */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="text-center space-y-4"
          >
            <h3 className="text-xl font-semibold">How It Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Enter your email (optional)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Start chatting immediately</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Upgrade anytime for more</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Email Capture Modal */}
      <EmailCaptureModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSubmit={handleEmailSubmit}
        onSkip={handleSkip}
        characterName={character.name}
        isLoading={isLoading}
      />
    </div>
  );
}

