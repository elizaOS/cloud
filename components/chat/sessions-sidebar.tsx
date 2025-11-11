"use client";

import { useEffect, useMemo } from "react";
import { useChatStore } from "@/stores/chat-store";
import { Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";

export function SessionsSidebar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { rooms, roomId, setRoomId, loadRooms, deleteRoom, availableCharacters, selectedCharacterId, createRoom } = useChatStore();

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Get characterId from URL (this is the source of truth)
  const urlCharacterId = searchParams.get("characterId");

  // Filter rooms based on URL characterId
  // If URL has characterId → show only that agent's rooms
  // If no characterId in URL → show ALL rooms
  const filteredRooms = useMemo(() => {
    if (!urlCharacterId) {
      // No character specified - show ALL rooms
      return rooms;
    }
    // Show only rooms for this specific agent
    return rooms.filter(room => room.characterId === urlCharacterId);
  }, [rooms, urlCharacterId]);

  const handleNewChat = async () => {
    console.log("[SessionsSidebar] Creating new chat for character:", urlCharacterId || "default");
    const result = await createRoom(urlCharacterId);
    if (result) {
      console.log("[SessionsSidebar] Room created:", result.roomId, "with characterId:", result.characterId);

      // Update URL with resolved character ID and new room ID
      const params = new URLSearchParams();
      params.set("roomId", result.roomId);

      // Use the resolved character ID from API response (in case it was a template)
      const finalCharacterId = result.characterId || urlCharacterId;
      if (finalCharacterId) {
        params.set("characterId", finalCharacterId);
      }

      const currentMode = searchParams.get("mode") || "chat";
      params.set("mode", currentMode);

      router.push(`/dashboard/chat?${params.toString()}`);
    }
  };

  const handleSelectRoom = (selectedRoomId: string) => {
    setRoomId(selectedRoomId);
  };

  const handleDeleteRoom = async (e: React.MouseEvent, roomIdToDelete: string) => {
    e.stopPropagation();
    if (confirm("Delete this conversation?")) {
      await deleteRoom(roomIdToDelete);
    }
  };

  return (
    <div className="w-[255px] border-r border-[#3e3e43] bg-[#0a0a0a] flex flex-col h-full shrink-0">
      {/* Header with New Chat Button */}
      <div className="p-4 border-b border-[#3e3e43] flex items-center justify-between">
        <h2 
          className="font-['Roboto_Mono'] font-medium text-white text-[16px] leading-normal"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          Recent Chats
        </h2>
        <button
          onClick={handleNewChat}
          className="w-8 h-8 flex items-center justify-center hover:bg-white/5 rounded transition-colors"
          title="New Chat"
        >
          <Plus className="w-5 h-5 text-[#858585] hover:text-white" />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {filteredRooms.map((room) => {
          const isSelected = room.id === roomId;
          const character = availableCharacters.find(c => c.id === room.characterId);
          
          return (
            <button
              key={room.id}
              onClick={() => handleSelectRoom(room.id)}
              className={`
                w-full flex items-start gap-3 px-4 py-3 border-b border-[#2e2e2e] hover:bg-white/5 transition-colors relative
                ${isSelected ? 'bg-white/5' : ''}
              `}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#FF5800]" />
              )}

              {/* Content */}
              <div className="flex-1 min-w-0 text-left">
                <div 
                  className="font-['Roboto_Mono'] font-medium text-white text-[14px] leading-normal truncate"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  {room.title || character?.name || "New Chat"}
                </div>
                {room.lastText && (
                  <div 
                    className="font-['Roboto_Flex'] font-normal text-[#858585] text-[12px] leading-normal truncate mt-1"
                    style={{ fontFamily: "'Roboto Flex', sans-serif" }}
                  >
                    {room.lastText}
                  </div>
                )}
              </div>

              {/* Delete button (shows on hover) */}
              <button
                onClick={(e) => handleDeleteRoom(e, room.id)}
                className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-opacity"
                title="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#858585] hover:text-red-500" />
              </button>
            </button>
          );
        })}

        {filteredRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
            <p 
              className="font-['Roboto_Flex'] font-normal text-[#858585] text-[14px] leading-normal"
              style={{ fontFamily: "'Roboto Flex', sans-serif" }}
            >
              {urlCharacterId 
                ? "No chats with this agent yet"
                : "No recent chats"}
            </p>
            <button
              onClick={handleNewChat}
              className="px-4 py-2 bg-[rgba(255,88,0,0.25)] text-[#ff5800] font-['Roboto_Mono'] font-medium text-[14px] hover:bg-[rgba(255,88,0,0.3)] transition-colors"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              Start Chatting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

