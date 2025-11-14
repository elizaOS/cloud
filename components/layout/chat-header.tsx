/**
 * Chat Header Component
 * Special header for the /chat page with agent picker and mode toggle
 */

"use client";

import { useRouter, usePathname } from "next/navigation";
import { Menu, ChevronDown, MessageSquare, Wrench, PlusCircleIcon, CheckCircle2Icon } from "lucide-react";
import Image from "next/image";
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
  const router = useRouter();
  const pathname = usePathname();
  const {
    availableCharacters,
    selectedCharacterId,
    setSelectedCharacterId,
    setRoomId,
  } = useChatStore();

  // Derive mode from pathname
  const mode = pathname.includes("/build") ? "build" : "chat";

  // Find selected agent
  const selectedAgent = availableCharacters.find(
    (a) => a.id === selectedCharacterId
  );

  const handleAgentChange = (characterId: string) => {
    const charId = characterId || null;
    setSelectedCharacterId(charId);
    // Clear current room selection since we're switching characters
    // User will need to select a room from the filtered list or create new
    setRoomId(null);

    // Update URL with new character, clearing roomId, staying on current mode
    const params = new URLSearchParams();
    if (charId) {
      params.set("characterId", charId);
    }
    const path = mode === "build" ? "/dashboard/build" : "/dashboard/chat";
    router.push(`${path}?${params.toString()}`);
  };

  const handleModeChange = (newMode: "chat" | "build") => {
    if (newMode === mode) return;

    // Build URL with current character
    const params = new URLSearchParams();
    if (selectedCharacterId) {
      params.set("characterId", selectedCharacterId);
    }

    const path = newMode === "build" ? "/dashboard/build" : "/dashboard/chat";
    const url = params.toString() ? `${path}?${params.toString()}` : path;
    router.push(url);
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
              type="button"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-none",
                "border border-white/10 bg-black/40",
                "hover:bg-white/5 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50"
              )}
            >
              {selectedAgent ? (
                <>
                  <div className="w-40 flex items-center gap-3">
                    {/* Agent Avatar */}


                    <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      {selectedAgent.avatarUrl ? (
                        <Image
                          src={selectedAgent.avatarUrl}
                          alt={selectedAgent.name}
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-xs font-medium">
                          {selectedAgent.name?.[0] || "A"}
                        </div>
                      )}
                    </div>
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
                    {/* Default Eliza Avatar */}
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      <Image
                        src="/avatars/eliza-chibi.png"
                        alt="Eliza"
                        width={24}
                        height={24}
                        className="w-full h-full object-cover"
                      />
                    </div>
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
            {/* New agent option */}

            <DropdownMenuItem
              onClick={() => router.push("/dashboard/character-creator")}
              className="">
              <div className="flex items-center gap-2">
                <PlusCircleIcon />
                New Agent
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
                      "flex items-center gap-3 px-3 py-2 cursor-pointer",
                      "hover:bg-white/5 focus:bg-white/5",
                      selectedCharacterId === character.id && "bg-white/10"
                    )}
                  >
                    {/* Character Avatar */}
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      {character.avatarUrl ? (
                        <Image
                          src={character.avatarUrl}
                          alt={character.name}
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-sm font-medium">
                          {character.name?.[0] || "A"}
                        </div>
                      )}
                    </div>
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
      <div className="flex items-center">
        <div className="flex items-center rounded-none border border-white/10 bg-black/40">
          <button
            type="button"
            onClick={() => handleModeChange("chat")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors border-0",
              mode === "chat"
                ? "bg-[#471E08] text-[#FF5800]"
                : "bg-[#1F1F1F] text-[#ADADAD] hover:text-white"
            )}
            style={{
              fontFamily: "'Roboto Mono', monospace",
              fontWeight: 500,
              fontSize: "14px",
              lineHeight: "18px",
            }}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden md:inline">Chat Mode</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("build")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors border-0",
              mode === "build"
                ? "bg-[#471E08] text-[#FF5800]"
                : "bg-[#1F1F1F] text-[#ADADAD] hover:text-white"
            )}
            style={{
              fontFamily: "'Roboto Mono', monospace",
              fontWeight: 500,
              fontSize: "14px",
              lineHeight: "18px",
            }}
          >
            <Wrench className="h-4 w-4" />
            <span className="hidden md:inline">Build Mode</span>
          </button>
        </div>
      </div>
    </header>
  );
}
