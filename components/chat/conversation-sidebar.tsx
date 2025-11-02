/**
 * Conversation Sidebar Component
 * Themed sidebar for managing chat rooms/conversations
 */

"use client";

import { Plus, RefreshCw, Clock, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BrandButton, SectionLabel } from "@/components/brand";
import { cn } from "@/lib/utils";

interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
  characterId?: string;
}

interface ConversationSidebarProps {
  rooms: RoomItem[];
  activeRoomId: string | null;
  isLoading?: boolean;
  onCreateRoom: () => void;
  onRefresh: () => void;
  onSelectRoom: (roomId: string) => void;
  formatTimestamp?: (timestamp: number) => string;
  getCharacterName?: (characterId?: string) => string;
  className?: string;
}

export function ConversationSidebar({
  rooms,
  activeRoomId,
  isLoading = false,
  onCreateRoom,
  onRefresh,
  onSelectRoom,
  formatTimestamp = (ts) => new Date(ts).toLocaleTimeString(),
  getCharacterName = () => "Default",
  className,
}: ConversationSidebarProps) {
  return (
    <div
      className={cn(
        "flex flex-col w-72 bg-black/40 border-r border-white/10",
        className
      )}
    >
      {/* Header */}
      <div className="relative border-b border-white/10 p-4">
        <SectionLabel>Conversations</SectionLabel>
      </div>

      {/* Actions */}
      <div className="p-3 space-y-2 border-b border-white/10">
        <BrandButton
          variant="primary"
          size="sm"
          onClick={onCreateRoom}
          className="w-full justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>New Conversation</span>
        </BrandButton>
        <BrandButton
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="w-full justify-center gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          <span>Refresh</span>
        </BrandButton>
      </div>

      {/* Rooms List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {isLoading && rooms.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-white/50" />
              </div>
            ) : (
              <>
                {rooms.map((room) => {
                  const isActive = room.id === activeRoomId;
                  const characterName = getCharacterName(room.characterId);

                  return (
                    <button
                      key={room.id}
                      className={cn(
                        "w-full rounded-none px-3 py-3 text-left transition-all",
                        "border-l-2",
                        isActive
                          ? "bg-white/10 border-[#FF5800] text-white"
                          : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                      onClick={() => onSelectRoom(room.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-semibold truncate flex-1">
                          Room {room.id.substring(0, 8)}...
                        </div>
                        {room.lastTime ? (
                          <div className="flex items-center gap-1 text-[10px] text-white/50 whitespace-nowrap ml-2">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(room.lastTime)}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="text-[10px] px-1.5 py-0.5 rounded-none font-medium"
                          style={{
                            backgroundColor: "#FF580020",
                            color: "#FF5800",
                            border: "1px solid #FF580040",
                          }}
                        >
                          {characterName}
                        </div>
                        {room.lastText && (
                          <div className="text-xs text-white/40 truncate flex-1">
                            {room.lastText}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                {rooms.length === 0 && !isLoading && (
                  <div className="px-3 py-8 text-center">
                    <p className="text-xs text-white/50">No conversations yet</p>
                    <p className="text-[10px] text-white/30 mt-1">
                      Start a new one above
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

