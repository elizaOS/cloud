"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Edit,
  Copy,
  Download,
  Trash2,
  MoreVertical,
  Code,
} from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import type { ViewMode } from "./my-agents-client";
import Image from "next/image";

interface CharacterLibraryCardProps {
  character: ElizaCharacter;
  viewMode: ViewMode;
}

export function CharacterLibraryCard({
  character,
  viewMode,
}: CharacterLibraryCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTest = useCallback(() => {
    console.log("[CharacterCard] Navigating to chat with:", {
      characterId: character.id,
      characterName: character.name,
      url: `/dashboard/chat?characterId=${character.id}`,
    });
    router.push(`/dashboard/chat?characterId=${character.id}`);
  }, [router, character.id, character.name]);

  const handleEdit = useCallback(() => {
    router.push(`/dashboard/character-creator?id=${character.id}`);
  }, [router, character.id]);

  const handleDuplicate = useCallback(async () => {
    try {
      toast.info("Duplicating character...");
      // TODO: Implement duplicate functionality
      router.push(`/dashboard/character-creator`);
    } catch (error) {
      toast.error("Failed to duplicate character");
    }
  }, [router]);

  const handleExport = useCallback(() => {
    try {
      const dataStr = JSON.stringify(character, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${character.name || "character"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Character exported successfully");
    } catch (error) {
      toast.error("Failed to export character");
    }
  }, [character]);

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${character.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      // TODO: Implement delete API call
      toast.success(`Deleted ${character.name}`);
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete character");
      setIsDeleting(false);
    }
  }, [character.name, router]);

  const bio = Array.isArray(character.bio)
    ? character.bio[0] || ""
    : character.bio || "";

  // Check if this is a top performing agent (use featured property from template)
  const isTopPerforming = (character as any).featured || false;

  // Get avatar URL - handle both ElizaCharacter (no avatarUrl) and ExtendedCharacter (has avatarUrl)
  const avatarUrl =
    (character as any).avatarUrl || (character as any).avatar_url;

  // Grid view - Exact Figma design specs
  return (
    <div
      className="border border-[rgba(62,62,67,0.5)] border-solid overflow-hidden relative w-full cursor-pointer hover:border-[rgba(255,88,0,0.5)] transition-colors"
      onClick={handleTest}
    >
      {/* Image Area - 347px height with 12px padding */}
      <div className="relative h-[347px] w-full p-[12px] flex items-center justify-center bg-black/40">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
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
          <div className="flex items-center gap-[4px] shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTest();
              }}
              className="w-[28px] h-[28px] flex items-center justify-center hover:bg-white/5 transition-colors rounded-[8px]"
              title="Chat"
            >
              <MessageSquare className="w-[18px] h-[18px] text-[#adadad]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEdit();
              }}
              className="w-[28px] h-[28px] flex items-center justify-center hover:bg-white/5 transition-colors rounded-[8px]"
              title="Code view"
            >
              <Code className="w-[18px] h-[18px] text-[#adadad]" />
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
            {bio || "No description available"}
          </p>
        </div>
      </div>

      {/* Hidden dropdown menu for future actions */}
      <div className="hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
