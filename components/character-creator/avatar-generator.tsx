/**
 * Avatar generator component for selecting or generating character avatars.
 * Supports built-in avatar selection, random generation, and AI-powered avatar generation.
 *
 * @param props - Avatar generator configuration
 * @param props.characterName - Character name for avatar generation
 * @param props.characterDescription - Optional character description
 * @param props.currentAvatarUrl - Current avatar URL
 * @param props.onAvatarChange - Callback when avatar changes
 * @param props.className - Additional CSS classes
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  generateDefaultAvatarUrl,
  getAvailableAvatarStyles,
} from "@/lib/utils/default-avatar";
import Image from "next/image";
import { AvatarUpload } from "../character-builder";

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
  const availableAvatars = getAvailableAvatarStyles();

  const handleSelectAvatar = (avatarUrl: string) => {
    onAvatarChange(avatarUrl);
    toast.success("Avatar selected");
  };

  const handleRandomize = () => {
    onAvatarChange(
      generateDefaultAvatarUrl(characterName || `char-${Date.now()}`),
    );
    toast.success("Random avatar selected");
  };

  const handleGenerateAIAvatar = async () => {
    if (!characterName) {
      toast.error("Please enter a character name first");
      return;
    }

    setIsGeneratingAI(true);

    const description = characterDescription || characterName;
    const prompt = `Professional avatar portrait for an AI character named "${characterName}". ${description}. Clean circular composition, dark background (#0A0A0A), high quality digital illustration style, suitable for profile picture. Modern, sleek design.`;

    const response = await fetch("/api/v1/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, aspectRatio: "1:1", numImages: 1 }),
    });

    try {
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate avatar");
      }

      const data = await response.json();

      if (data.images?.[0]) {
        const newAvatarUrl = data.images[0].url || data.images[0].image;
        if (!newAvatarUrl) throw new Error("No valid image URL in response");
        onAvatarChange(newAvatarUrl);
        toast.success("AI avatar generated!");
      } else {
        throw new Error("No image returned");
      }
    } catch (error) {
      console.error("Error generating AI avatar:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate AI avatar",
      );
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Current Avatar Preview */}
      <div className="flex items-center gap-4">
        <AvatarUpload
          value={currentAvatarUrl}
          onChange={onAvatarChange}
          name={characterName}
          size="lg"
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/60">Current avatar</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRandomize}
              className="rounded-none border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Random
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
              {isGeneratingAI ? "Generating..." : "AI Avatar"}
            </Button>
          </div>
        </div>
      </div>

      {/* Avatar Selection Grid */}
      <div className="space-y-2">
        <p className="text-sm text-white/60">Choose from built-in avatars:</p>

        <div className="p-2">
          <div className="grid grid-cols-[repeat(10,_auto)] gap-1">
            {availableAvatars.map((avatar) => {
              const isSelected = currentAvatarUrl === avatar.url;
              return (
                <button
                  key={avatar.id}
                  onClick={() => handleSelectAvatar(avatar.url)}
                  className={cn(
                    "relative w-[60px] h-[60px] rounded-lg overflow-hidden border-2 transition-all",
                    isSelected
                      ? "border-[#FF5800] ring-2 ring-[#FF5800]/30"
                      : "border-transparent hover:border-white/30",
                  )}
                  title={avatar.name}
                >
                  <Image
                    src={avatar.url}
                    alt={avatar.name}
                    fill
                    className="object-cover"
                    draggable={false}
                    sizes="56px"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-[#FF5800]/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-[#FF5800]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
