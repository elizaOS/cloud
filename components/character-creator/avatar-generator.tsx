"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  generateDefaultAvatarUrl,
  getAvailableAvatarStyles,
  isDiceBearAvatar,
  type AvatarStyle,
} from "@/lib/utils/default-avatar";
import Image from "next/image";

interface AvatarGeneratorProps {
  characterName: string;
  characterDescription?: string;
  currentAvatarUrl?: string;
  onAvatarChange: (avatarUrl: string) => void;
  className?: string;
}

export function AvatarGenerator({
  characterName,
  characterDescription,
  currentAvatarUrl,
  onAvatarChange,
  className,
}: AvatarGeneratorProps) {
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const availableStyles = getAvailableAvatarStyles();

  const handleGenerateDiceBear = (style: AvatarStyle) => {
    onAvatarChange(generateDefaultAvatarUrl(characterName, { style }));
    toast.success(`Avatar style: ${style}`);
  };

  const handleRegenerateDiceBear = () => {
    onAvatarChange(generateDefaultAvatarUrl(`${characterName}-${Date.now()}`));
    toast.success("Avatar regenerated");
  };

  const handleGenerateAIAvatar = async () => {
    if (!characterName) {
      toast.error("Please enter a character name first");
      return;
    }

    setIsGeneratingAI(true);

    try {
      const description = characterDescription || characterName;
      const prompt = `Professional avatar portrait for an AI character named "${characterName}". ${description}. Clean circular composition, dark background (#0A0A0A), high quality digital illustration style, suitable for profile picture. Modern, sleek design.`;

      const response = await fetch("/api/v1/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: "1:1", numImages: 1 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate avatar");
      }

      const data = await response.json();

      if (data.images?.[0]) {
        const newAvatarUrl = data.images[0].url || data.images[0].image;
        if (!newAvatarUrl) throw new Error("No valid image URL in response");
        onAvatarChange(newAvatarUrl);
        toast.success("AI avatar generated! ($0.01)");
      } else {
        throw new Error("No image returned");
      }
    } catch (error) {
      console.error("Error generating AI avatar:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate AI avatar");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-none border border-white/10 bg-black/40 overflow-hidden">
          {currentAvatarUrl ? (
            <Image
              src={currentAvatarUrl}
              alt={characterName || "Avatar"}
              fill
              className="object-cover"
              sizes="80px"
              unoptimized={isDiceBearAvatar(currentAvatarUrl)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/40">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/60">
            {currentAvatarUrl ? "Current avatar" : "No avatar set"}
          </p>
          <div className="flex flex-wrap gap-1">
            {availableStyles.map((style) => (
              <Button
                key={style.id}
                variant="outline"
                size="sm"
                onClick={() => handleGenerateDiceBear(style.id)}
                className="h-7 px-2 text-xs rounded-none border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white"
                title={style.description}
              >
                {style.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerateDiceBear}
          className="rounded-none border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Randomize
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateAIAvatar}
          disabled={isGeneratingAI || !characterName}
          className="rounded-none border-[#FF5800]/30 bg-[#FF5800]/10 text-[#FF5800] hover:bg-[#FF5800]/20"
        >
          {isGeneratingAI ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isGeneratingAI ? "Generating..." : "AI Avatar ($0.01)"}
        </Button>
      </div>

      <p className="text-xs text-white/40">
        Quick styles are free. AI avatars cost $0.01 for a unique image.
      </p>
    </div>
  );
}
