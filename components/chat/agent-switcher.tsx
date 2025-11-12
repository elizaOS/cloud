"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import Image from "next/image";
import { useChatStore } from "@/stores/chat-store";
import { useRouter } from "next/navigation";
import { useModeStore } from "@/stores/mode-store";
import { DEMO_AGENTS } from "@/lib/data/demo-agents";
import { getAllTemplates } from "@/lib/characters/template-loader";

export function AgentSwitcher() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedCharacterId,
    availableCharacters,
    setSelectedCharacterId,
    setRoomId,
    loadRooms,
    createRoom,
  } = useChatStore();
  const { mode } = useModeStore();

  // Get all templates to merge with user's characters
  const templates = getAllTemplates();

  // Combine user characters with template characters
  const allAgents = [
    // User's existing characters
    ...availableCharacters.map((char) => {
      // Try to find matching template for avatar
      const template = templates.find((t) => t.username === char.username);
      return {
        id: char.id,
        name: char.name,
        username: char.username,
        avatarUrl: template?.avatarUrl,
        description: "",
      };
    }),
    // Add templates that user doesn't have yet
    ...templates
      .filter(
        (t) => !availableCharacters.some((c) => c.username === t.username),
      )
      .map((template) => ({
        id: template.id,
        name: template.name,
        username: template.username,
        avatarUrl: template.avatarUrl,
        description:
          typeof template.bio === "string" ? template.bio : template.bio?.[0],
      })),
  ];

  const selectedAgent = allAgents.find((a) => a.id === selectedCharacterId);

  const handleAgentSelect = async (agentId: string) => {
    console.log("[AgentSwitcher] Switching to agent:", agentId);
    setSelectedCharacterId(agentId);
    setIsOpen(false);

    // Check if this agent has any rooms
    const agentRooms = await loadRooms();
    const hasRooms = agentRooms?.some((r: any) => r.characterId === agentId);

    if (!hasRooms) {
      // No rooms for this agent - create one automatically
      console.log(
        "[AgentSwitcher] No rooms found for agent, creating new room",
      );
      const result = await createRoom(agentId);

      if (result) {
        // Use the resolved character ID (in case it was a template)
        const finalCharacterId = result.characterId || agentId;
        console.log(
          "[AgentSwitcher] Room created with character ID:",
          finalCharacterId,
        );

        // Navigate with the resolved character ID
        const params = new URLSearchParams();
        params.set("mode", mode);
        params.set("characterId", finalCharacterId);
        params.set("roomId", result.roomId);

        router.push(`/dashboard/chat?${params.toString()}`);
      }
    } else {
      // Has rooms - clear current selection to show the list
      console.log("[AgentSwitcher] Found existing rooms for agent");
      setRoomId(null);

      // Navigate to chat with character
      router.push(`/dashboard/chat?mode=${mode}&characterId=${agentId}`);
    }
  };

  const handleNewAgent = () => {
    router.push("/dashboard/chat?mode=build");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-white/5 transition-colors px-2 py-1 rounded-sm"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#FF5800]/20 flex items-center justify-center overflow-hidden shrink-0">
          {selectedAgent?.avatarUrl ? (
            <Image
              src={selectedAgent.avatarUrl}
              alt={selectedAgent.name || "Agent"}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#FF5800]/20 to-[#FF5800]/5" />
          )}
        </div>

        {/* Name and Description */}
        <div className="flex flex-col items-start min-w-0">
          <span
            className="font-['Roboto_Mono'] font-medium text-white text-[14px] leading-normal truncate max-w-[120px]"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            {selectedAgent?.name || "Select Agent"}
          </span>
          {selectedAgent?.username && (
            <span
              className="font-['Roboto_Flex'] font-normal text-[#858585] text-[12px] leading-normal truncate max-w-[120px]"
              style={{ fontFamily: "'Roboto Flex', sans-serif" }}
            >
              {selectedAgent.username}
            </span>
          )}
        </div>

        {/* Chevron */}
        <ChevronDown className="w-4 h-4 text-white/60" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute top-full left-0 mt-2 w-[280px] bg-[#1d1d1d] border border-[#3e3e43] border-solid z-50 max-h-[500px] overflow-y-auto">
            {/* New Agent Option */}
            <button
              onClick={handleNewAgent}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#2e2e2e]"
            >
              <div className="w-8 h-8 rounded-full bg-[#FF5800]/20 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-[#FF5800]" />
              </div>
              <span
                className="font-['Roboto_Mono'] font-medium text-white text-[14px] leading-normal"
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                New Agent
              </span>
            </button>

            {/* Agent List */}
            {allAgents.map((agent) => {
              const isSelected = agent.id === selectedCharacterId;
              return (
                <button
                  key={agent.id}
                  onClick={() => handleAgentSelect(agent.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors relative ${isSelected ? "bg-white/5" : ""}`}
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#FF5800]" />
                  )}

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#FF5800]/20 flex items-center justify-center overflow-hidden shrink-0">
                    {agent.avatarUrl ? (
                      <Image
                        src={agent.avatarUrl}
                        alt={agent.name || "Agent"}
                        width={40}
                        height={40}
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#FF5800]/20 to-[#FF5800]/5" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span
                      className="font-['Roboto_Mono'] font-medium text-white text-[14px] leading-normal truncate w-full"
                      style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                      {agent.name}
                    </span>
                    {agent.description && (
                      <span
                        className="font-['Roboto_Flex'] font-normal text-[#858585] text-[12px] leading-normal truncate w-full"
                        style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                      >
                        {typeof agent.description === "string"
                          ? agent.description.substring(0, 30) + "..."
                          : "Agent Description"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
