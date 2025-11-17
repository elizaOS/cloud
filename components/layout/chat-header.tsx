/**
 * Chat Header Component
 * Special header for the /chat page with agent picker and mode toggle
 */

"use client";

import { useRouter, usePathname } from "next/navigation";
import { Menu, ChevronDown, MessageSquare, Wrench, PlusCircleIcon, Check } from "lucide-react";
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

  const isBuildMode = mode === "build";

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
                "flex items-center gap-4 bg-[#1b1b1b] px-2 py-0 w-[238px]",
                "hover:bg-white/5 transition-colors focus:outline-none"
              )}
            >
              {selectedAgent ? (
                <>
                  {/* Agent Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center">
                    {selectedAgent.avatarUrl ? (
                      <Image
                        src={selectedAgent.avatarUrl}
                        alt={selectedAgent.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        unoptimized
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector(".fallback-text")) {
                            const fallback = document.createElement("div");
                            fallback.className = "fallback-text w-full h-full flex items-center justify-center text-white text-sm font-medium bg-[#FF5800] leading-none";
                            fallback.style.lineHeight = "1";
                            fallback.textContent = selectedAgent.name?.[0] || "A";
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-sm font-medium bg-[#FF5800] leading-none" style={{ lineHeight: "1" }}>
                        {selectedAgent.name?.[0]?.toUpperCase() || "A"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-start justify-center gap-[2px] h-16 flex-1 min-w-0">
                    <p
                      className="text-white truncate w-full"
                      style={{
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: "16px",
                        lineHeight: "normal",
                        letterSpacing: "-0.048px",
                        fontWeight: 500,
                      }}
                    >
                      {selectedAgent.name}
                    </p>
                    <p
                      className="text-[#a1a1a1] truncate w-full"
                      style={{
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: "14px",
                        lineHeight: "normal",
                        letterSpacing: "-0.042px",
                        fontWeight: 400,
                      }}
                    >
                      {selectedAgent.username ? `@${selectedAgent.username}` : "Agent"}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-[#a2a0a3] shrink-0" />
                </>
              ) : (
                <>
                  {/* Default Eliza Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center">
                    <Image
                      src="/avatars/eliza-chibi.png"
                      alt="Eliza"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector(".fallback-text")) {
                          const fallback = document.createElement("div");
                          fallback.className = "fallback-text w-full h-full flex items-center justify-center text-white text-sm font-medium bg-[#FF5800] leading-none";
                          fallback.style.lineHeight = "1";
                          fallback.textContent = "Z";
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col items-start justify-center gap-[2px] h-16 flex-1 min-w-0">
                    <p
                      className="text-white truncate w-full"
                      style={{
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: "16px",
                        lineHeight: "normal",
                        letterSpacing: "-0.048px",
                        fontWeight: 500,
                      }}
                    >
                      Zilo
                    </p>
                    <p
                      className="text-[#a1a1a1] truncate w-full"
                      style={{
                        fontFamily: "'Roboto Mono', monospace",
                        fontSize: "14px",
                        lineHeight: "normal",
                        letterSpacing: "-0.042px",
                        fontWeight: 400,
                      }}
                    >
                      @zilo
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-[#a2a0a3] shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[238px] rounded-none bg-[#101010] border border-[#2e2e2e] p-0 max-h-[400px] overflow-y-auto"
          >
            {/* New agent option */}
            <div className="px-2 py-0 transition-colors hover:bg-white/5">
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/character-creator")}
                className="px-0 py-3 rounded-none hover:bg-transparent focus:bg-transparent cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <PlusCircleIcon className="h-[18px] w-[18px] text-[#a2a2a2]" />
                  <span
                    className="text-[#a2a2a2]"
                    style={{
                      fontFamily: "'Roboto Mono', monospace",
                      fontSize: "14px",
                      lineHeight: "normal",
                      fontWeight: 400,
                    }}
                  >
                    New Agent
                  </span>
                </div>
              </DropdownMenuItem>
            </div>

            {/* User's custom characters - All agents with scroll */}
            {availableCharacters.length > 0 && (
              <>
                {availableCharacters.map((character) => (
                  <div
                    key={character.id}
                    className={cn(
                      "border-t border-[#2e2e2e] p-2 transition-colors",
                      selectedCharacterId === character.id && "bg-[#1b1b1b]",
                      "hover:bg-white/5"
                    )}
                  >
                    <DropdownMenuItem
                      onClick={() => handleAgentChange(character.id)}
                      className="flex items-center justify-between p-0 rounded-none hover:bg-transparent focus:bg-transparent cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Character Avatar */}
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center">
                          {character.avatarUrl ? (
                            <Image
                              src={character.avatarUrl}
                              alt={character.name}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                              unoptimized
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector(".fallback-text")) {
                                  const fallback = document.createElement("div");
                                  fallback.className = "fallback-text w-full h-full flex items-center justify-center text-white text-xs font-medium bg-[#FF5800] leading-none";
                                  fallback.style.lineHeight = "1";
                                  fallback.textContent = character.name?.[0]?.toUpperCase() || "A";
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-xs font-medium bg-[#FF5800] leading-none" style={{ lineHeight: "1" }}>
                              {character.name?.[0]?.toUpperCase() || "A"}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1 min-w-0">
                          <p
                            className="text-[#e1e1e1] truncate w-full"
                            style={{
                              fontFamily: "'Roboto Mono', monospace",
                              fontSize: "14px",
                              lineHeight: "normal",
                              fontWeight: 400,
                            }}
                          >
                            {character.name}
                          </p>
                          <p
                            className="text-[#a2a2a2] truncate w-full"
                            style={{
                              fontFamily: "'Roboto Mono', monospace",
                              fontSize: "10px",
                              lineHeight: "normal",
                              fontWeight: 400,
                            }}
                          >
                            {character.username ? `@${character.username}` : "Agent Description"}
                          </p>
                        </div>
                      </div>
                      {/* Checkmark indicator */}
                      <div
                        className={cn(
                          "flex items-center justify-center rounded-[10.667px] p-1",
                          selectedCharacterId === character.id
                            ? "bg-[rgba(255,88,0,0.1)]"
                            : "bg-neutral-800 opacity-0"
                        )}
                      >
                        <Check
                          className="h-4 w-4"
                          style={{
                            color: selectedCharacterId === character.id ? "#FF5800" : "#fafafa",
                            strokeWidth: 2.5,
                          }}
                        />
                      </div>
                    </DropdownMenuItem>
                  </div>
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
              "flex items-center gap-2 px-4 py-2 rounded-none transition-colors border-0",
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
              "flex items-center gap-2 px-4 py-2 rounded-none transition-colors border-0",
              mode === "build"
                ? "bg-[#220725] text-[#E500FF]"
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
