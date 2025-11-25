"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, MessageCircle, Lock, CheckCircle, Heart } from "lucide-react";
import type { UserCharacter } from "@/db/schemas";
import { EmailCaptureModal } from "./email-capture-modal";
import { motion } from "motion/react";

interface CharacterIntroPageCrushProps {
  character: UserCharacter;
  onEmailSubmit: (email: string) => Promise<void>;
  onSkip: () => void;
  source?: string;
}

export function CharacterIntroPageCrush({ 
  character, 
  onEmailSubmit, 
  onSkip,
  source 
}: CharacterIntroPageCrushProps) {
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
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,rgba(219,39,119,0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(147,51,234,0.1),transparent_50%)]">
      {/* Animated background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(219,39,119,0.08),transparent_70%)] animate-pulse" style={{ animationDuration: "4s" }} />
      </div>

      <div className="container mx-auto px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            {source && (
              <Badge 
                variant="secondary" 
                className="mb-4 bg-pink-500/10 text-pink-400 border-pink-500/20 hover:bg-pink-500/20"
              >
                <Heart className="w-3 h-3 mr-1" />
                Created via {source}
              </Badge>
            )}
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-pink-400 via-pink-300 to-purple-400 bg-clip-text text-transparent">
              Meet Your Crush
            </h1>
            <p className="text-white/60">
              Your personalized AI companion is ready to chat
            </p>
          </div>

          {/* Character Card */}
          <Card className="mb-8 overflow-hidden border-2 border-white/10 bg-white/[0.02] backdrop-blur-xl">
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 opacity-20 blur-xl" />
                    <Avatar className="h-32 w-32 border-4 border-pink-500/30 relative">
                      <AvatarImage src={character.avatar_url || undefined} />
                      <AvatarFallback className="text-4xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-white">
                        {character.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </motion.div>

                {/* Name and Vibe */}
                <div>
                  <h2 className="text-3xl font-bold mb-2 text-white">{character.name}</h2>
                  {vibeLabel && (
                    <Badge 
                      variant="outline" 
                      className="text-lg px-3 py-1 bg-pink-500/10 border-pink-500/30 text-pink-300"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {vibeLabel.charAt(0).toUpperCase() + vibeLabel.slice(1)}
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                <p className="text-lg text-white/70 max-w-xl leading-relaxed">
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
                    className="w-full text-lg h-14 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500 text-white border-0 shadow-lg shadow-pink-500/30"
                    onClick={handleStartChat}
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Start Chatting (Free)
                  </Button>
                  
                  <p className="text-sm text-white/50">
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
            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pink-500/10 mb-4">
                  <Sparkles className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="font-semibold mb-2 text-white">Personalized</h3>
                <p className="text-sm text-white/60">
                  AI that matches your chosen personality
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pink-500/10 mb-4">
                  <MessageCircle className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="font-semibold mb-2 text-white">Natural Chat</h3>
                <p className="text-sm text-white/60">
                  Conversations that feel real and engaging
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pink-500/10 mb-4">
                  <Lock className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="font-semibold mb-2 text-white">Private</h3>
                <p className="text-sm text-white/60">
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
            <h3 className="text-xl font-semibold text-white">How It Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-pink-400" />
                <span>Enter your email (optional)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-pink-400" />
                <span>Start chatting immediately</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-pink-400" />
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



