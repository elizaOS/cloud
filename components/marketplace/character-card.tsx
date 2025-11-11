"use client";

import Image from "next/image";
import { MessageSquare, Code } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ExtendedCharacter } from "@/lib/types/my-agents";

interface CharacterCardProps {
  character: ExtendedCharacter;
  onStartChat: (character: ExtendedCharacter) => void;
  onClone: (character: ExtendedCharacter) => void;
  onViewDetails: (character: ExtendedCharacter) => void;
}

export function CharacterCard({
  character,
  onStartChat,
  onClone,
  onViewDetails,
}: CharacterCardProps) {
  const router = useRouter();

  const bioText = Array.isArray(character.bio)
    ? character.bio[0]
    : character.bio;

  // Check if this is a top performing agent
  // Show for featured agents or specifically for "Ember" (demo agent)
  const isTopPerforming = character.featured || character.name === "Ember";

  // Navigate to chat mode
  const handleChatMode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[CharacterCard] Navigating to chat mode:", character.id);
    router.push(`/dashboard/chat?mode=chat&characterId=${character.id}`);
  };

  // Navigate to build mode
  const handleBuildMode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[CharacterCard] Navigating to build mode:", character.id);
    router.push(`/dashboard/chat?mode=build&characterId=${character.id}`);
  };

  return (
    <div className="border border-[rgba(62,62,67,0.5)] border-solid overflow-hidden relative w-full">
      {/* Image Area - 347px height with 12px padding */}
      <div className="relative h-[347px] w-full p-[12px] flex items-center justify-center bg-black/40">
        {character.avatarUrl ? (
          <Image
            src={character.avatarUrl}
            alt={character.name || "Agent"}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#FF5800]/20 to-[#FF5800]/5" />
        )}
      </div>

      {/* Content Area - 16px padding */}
      <div className="p-[16px] flex flex-col gap-[12px]">
        {/* Heading and Icons - gap-[12px] */}
        <div className="flex items-center justify-between gap-[12px]">
          {/* Left: Name and Badge - gap-[8px] */}
          <div className="flex items-center gap-[8px] flex-1 min-w-0">
            <h3
              className="font-['Roboto_Mono'] font-bold text-white text-[16px] leading-[24px] truncate"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              {character.name || "Unnamed"}
            </h3>
            {isTopPerforming && (
              <span
                className="font-['Roboto_Flex'] font-medium text-[#ff5800] text-[12px] leading-normal whitespace-nowrap"
                style={{
                  fontFamily: "'Roboto Flex', sans-serif",
                  fontVariationSettings:
                    "'GRAD' 0, 'XOPQ' 96, 'XTRA' 468, 'YOPQ' 79, 'YTAS' 750, 'YTDE' -203, 'YTFI' 738, 'YTLC' 514, 'YTUC' 712, 'wdth' 100",
                }}
              >
                Top performing
              </span>
            )}
          </div>

          {/* Right: Action Icons - gap-[4px], 28x28px containers */}
          <div className="flex items-center gap-[4px] shrink-0 z-10 relative">
            <button
              onClick={handleChatMode}
              className="w-[28px] h-[28px] flex items-center justify-center hover:bg-white/5 transition-colors rounded-[8px] cursor-pointer"
              title="Chat Mode"
              type="button"
            >
              <MessageSquare className="w-[18px] h-[18px] text-[#adadad] pointer-events-none" />
            </button>
            <button
              onClick={handleBuildMode}
              className="w-[28px] h-[28px] flex items-center justify-center hover:bg-white/5 transition-colors rounded-[8px] cursor-pointer"
              title="Build Mode"
              type="button"
            >
              <Code className="w-[18px] h-[18px] text-[#adadad] pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Description - gap-[4px] from heading */}
        <div className="flex items-end gap-[4px]">
          <p
            className="flex-1 font-['Roboto_Flex'] font-normal text-[16px] leading-[20px] text-[rgba(255,255,255,0.6)] line-clamp-2 min-w-0"
            style={{
              fontFamily: "'Roboto Flex', sans-serif",
              fontVariationSettings:
                "'GRAD' 0, 'XOPQ' 96, 'XTRA' 468, 'YOPQ' 79, 'YTAS' 750, 'YTDE' -203, 'YTFI' 738, 'YTLC' 514, 'YTUC' 712, 'wdth' 100",
            }}
          >
            {bioText || "No description available"}
          </p>
        </div>
      </div>
    </div>
  );
}
