/**
 * Chat Header Component
 * Special header for the /chat page with agent picker and mode toggle
 */

"use client";

import { Menu, ChevronDown, MessageSquare, Wrench } from "lucide-react";
import { BrandButton } from "@/components/brand";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";

interface ChatHeaderProps {
  onToggleSidebar?: () => void;
}

export function ChatHeader({ onToggleSidebar }: ChatHeaderProps) {
  const {
    availableCharacters,
    selectedCharacterId,
    setSelectedCharacterId,
    setRoomId,
    mode,
    setMode,
  } = useChatStore();

  // Find selected agent
  const selectedAgent = availableCharacters.find(
    (a) => a.id === selectedCharacterId,
  );

  const handleAgentChange = (characterId: string) => {
    const charId = characterId || null;
    setSelectedCharacterId(charId);
    // Clear current room selection since we're switching characters
    // User will need to select a room from the filtered list or create new
    setRoomId(null);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-black/40 px-4 md:px-6">
      <div className="flex items-center gap-4">
        {/* Mobile Menu Button */}
        <BrandButton
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5 text-white" />
        </BrandButton>

        {/* Agent Picker Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-none",
                "border border-white/10 bg-black/40",
                "hover:bg-white/5 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50",
              )}
            >
              {selectedAgent ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: "#FF5800" }}
                    />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium text-white">
                        {selectedAgent.name}
                      </span>
                      {selectedAgent.username && (
                        <span className="text-xs text-white/60">
                          @{selectedAgent.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/60" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: "#FF5800" }}
                    />
                    <span className="text-sm text-white">Default (Eliza)</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/60" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64 bg-[#0A0A0A] border-white/10"
          >
            {/* Default Eliza option */}
            <DropdownMenuItem
              onClick={() => handleAgentChange("")}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer",
                "hover:bg-white/5 focus:bg-white/5",
                !selectedCharacterId && "bg-white/10",
              )}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: "#FF5800" }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">
                  Default (Eliza)
                </span>
              </div>
            </DropdownMenuItem>

            {/* User's custom characters */}
            {availableCharacters.length > 0 && (
              <>
                <div className="border-t border-white/10 my-1" />
                {availableCharacters.map((character) => (
                  <DropdownMenuItem
                    key={character.id}
                    onClick={() => handleAgentChange(character.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer",
                      "hover:bg-white/5 focus:bg-white/5",
                      selectedCharacterId === character.id && "bg-white/10",
                    )}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: "#FF5800" }}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {character.name}
                      </span>
                      {character.username && (
                        <span className="text-xs text-white/60">
                          @{character.username}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-none border border-white/10 bg-black/40">
          <button
            onClick={() => setMode("chat")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors text-sm",
              mode === "chat"
                ? "bg-[#FF5800] text-white"
                : "text-white/60 hover:text-white hover:bg-white/5",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden md:inline">Chat Mode</span>
          </button>
          <button
            onClick={() => setMode("build")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors text-sm",
              mode === "build"
                ? "bg-[#FF5800] text-white"
                : "text-white/60 hover:text-white hover:bg-white/5",
            )}
          >
            <Wrench className="h-4 w-4" />
            <span className="hidden md:inline">Build Mode</span>
          </button>
        </div>
      </div>
    </header>
  );
}
