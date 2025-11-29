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
import type { AffiliateTheme } from "@/lib/config/affiliate-themes";
import { getThemeCSSVariables } from "@/lib/config/affiliate-themes";

interface CharacterIntroPageProps {
  character: UserCharacter;
  onEmailSubmit: (email: string) => Promise<void>;
  onSkip: () => void;
  source?: string;
  theme: AffiliateTheme;
}

export function CharacterIntroPage({ 
  character, 
  onEmailSubmit, 
  onSkip,
  source,
  theme,
}: CharacterIntroPageProps) {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Extract bio text
  const bioText = Array.isArray(character.bio) 
    ? character.bio.join(" ") 
    : character.bio;

  // Get vibe from character metadata
  const characterData = character.character_data as Record<string, unknown> | undefined;
  const affiliate = characterData?.affiliate as Record<string, unknown> | undefined;
  const vibeLabel = affiliate?.vibe as string | undefined;

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

  // Get CSS variables for theming
  const themeStyles = getThemeCSSVariables(theme);
  
  // Determine if this is a romantic/crush theme
  const isRomanticTheme = theme.variants.introCard === 'romantic';
  const showAnimatedBackground = theme.features.animatedBackground;

  return (
    <div 
      style={themeStyles}
      className={`min-h-screen themed-intro ${
        isRomanticTheme 
          ? 'bg-black bg-[radial-gradient(ellipse_at_top,rgba(var(--theme-primary),0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent),0.1),transparent_50%)]'
          : 'bg-gradient-to-b from-background to-muted/20'
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

      <div className="container mx-auto px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            {theme.features.showSourceBadge && source && (
              <Badge 
                variant="secondary" 
                className={`mb-4 ${
                  isRomanticTheme 
                    ? 'bg-[rgba(var(--theme-primary),0.1)] text-[rgb(var(--theme-primary-light))] border-[rgba(var(--theme-primary),0.2)] hover:bg-[rgba(var(--theme-primary),0.2)]'
                    : ''
                }`}
              >
                {isRomanticTheme && <Heart className="w-3 h-3 mr-1" />}
                Created via {source}
              </Badge>
            )}
            <h1 className={`text-4xl font-bold mb-2 ${
              isRomanticTheme 
                ? 'bg-gradient-to-r from-[rgb(var(--theme-primary-light))] via-[rgb(var(--theme-primary-light))] to-[rgb(var(--theme-accent))] bg-clip-text text-transparent'
                : ''
            }`}>
              {theme.branding.title === "Clone Your Crush" ? "Meet Your Crush" : "Meet Your AI Companion"}
            </h1>
            <p className={isRomanticTheme ? 'text-white/60' : 'text-muted-foreground'}>
              {theme.branding.tagline}
            </p>
          </div>

          {/* Character Card */}
          <Card className={`mb-8 overflow-hidden ${
            isRomanticTheme 
              ? 'border-2 border-white/10 bg-white/[0.02] backdrop-blur-xl'
              : 'border-2'
          }`}>
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  <div className="relative">
                    {/* Glow effect for romantic theme */}
                    {theme.variants.avatarStyle === 'glow' && (
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-accent))] opacity-20 blur-xl" />
                    )}
                    <Avatar className={`h-32 w-32 relative ${
                      theme.variants.avatarStyle === 'glow'
                        ? 'border-4 border-[rgba(var(--theme-primary),0.3)]'
                        : 'border-4 border-primary/20'
                    }`}>
                      <AvatarImage src={character.avatar_url || undefined} />
                      <AvatarFallback className={`text-4xl ${
                        isRomanticTheme
                          ? 'bg-gradient-to-br from-[rgba(var(--theme-primary),0.2)] to-[rgba(var(--theme-accent),0.2)] text-white'
                          : 'bg-gradient-to-br from-primary/20 to-primary/10'
                      }`}>
                        {character.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </motion.div>

                {/* Name and Vibe */}
                <div>
                  <h2 className={`text-3xl font-bold mb-2 ${isRomanticTheme ? 'text-white' : ''}`}>
                    {character.name}
                  </h2>
                  {theme.features.showVibeLabel && vibeLabel && (
                    <Badge 
                      variant="outline" 
                      className={`text-lg px-3 py-1 ${
                        isRomanticTheme 
                          ? 'bg-[rgba(var(--theme-primary),0.1)] border-[rgba(var(--theme-primary),0.3)] text-[rgb(var(--theme-primary-light))]'
                          : ''
                      }`}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {vibeLabel.charAt(0).toUpperCase() + vibeLabel.slice(1)}
                    </Badge>
                  )}
                </div>

                {/* Bio */}
                <p className={`text-lg max-w-xl leading-relaxed ${
                  isRomanticTheme ? 'text-white/70' : 'text-muted-foreground'
                }`}>
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
                    className={`w-full text-lg h-14 ${
                      isRomanticTheme
                        ? 'bg-gradient-to-r from-[rgb(var(--theme-primary))] to-[rgb(var(--theme-gradient-to))] hover:from-[rgb(var(--theme-primary-light))] hover:to-[rgb(var(--theme-primary))] text-white border-0 shadow-lg shadow-[rgba(var(--theme-primary),0.3)]'
                        : 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70'
                    }`}
                    onClick={handleStartChat}
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Start Chatting (Free)
                  </Button>
                  
                  <p className={`text-sm ${isRomanticTheme ? 'text-white/50' : 'text-muted-foreground'}`}>
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
            {[
              { icon: Sparkles, title: "Personalized", desc: "AI that matches your chosen personality" },
              { icon: MessageCircle, title: "Natural Chat", desc: "Conversations that feel real and engaging" },
              { icon: Lock, title: "Private", desc: "Your conversations stay between you and your AI" },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className={
                isRomanticTheme 
                  ? 'border-white/10 bg-white/[0.02] backdrop-blur-xl'
                  : ''
              }>
                <CardContent className="p-6 text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${
                    isRomanticTheme
                      ? 'bg-[rgba(var(--theme-primary),0.1)]'
                      : 'bg-primary/10'
                  }`}>
                    <Icon className={`w-6 h-6 ${
                      isRomanticTheme ? 'text-[rgb(var(--theme-primary-light))]' : 'text-primary'
                    }`} />
                  </div>
                  <h3 className={`font-semibold mb-2 ${isRomanticTheme ? 'text-white' : ''}`}>{title}</h3>
                  <p className={`text-sm ${isRomanticTheme ? 'text-white/60' : 'text-muted-foreground'}`}>
                    {desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* How It Works */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="text-center space-y-4"
          >
            <h3 className={`text-xl font-semibold ${isRomanticTheme ? 'text-white' : ''}`}>How It Works</h3>
            <div className={`flex flex-col md:flex-row items-center justify-center gap-6 text-sm ${
              isRomanticTheme ? 'text-white/60' : 'text-muted-foreground'
            }`}>
              {[
                "Enter your email (optional)",
                "Start chatting immediately",
                "Upgrade anytime for more",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <CheckCircle className={`w-5 h-5 ${
                    isRomanticTheme ? 'text-[rgb(var(--theme-primary-light))]' : 'text-primary'
                  }`} />
                  <span>{text}</span>
                </div>
              ))}
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

      {/* Theme CSS Variables */}
      <style jsx global>{`
        .themed-intro {
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
