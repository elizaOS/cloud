/**
 * Chat sidebar component for the /chat page displaying rooms and conversations.
 * Supports room creation, deletion, editing, and navigation.
 *
 * @param props - Chat sidebar configuration
 * @param props.className - Additional CSS classes
 * @param props.isOpen - Whether sidebar is open (mobile)
 * @param props.onToggle - Callback to toggle sidebar visibility
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  X,
  MessageSquare,
  Loader2,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets, LockOnButton } from "@/components/brand";
import { useChatStore } from "@/lib/stores/chat-store";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";

interface ChatSidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface OperationState {
  deletingRoomId: string | null;
  isCreatingRoom: boolean;
  loadingRoomId: string | null;
}

export function ChatSidebar({
  className,
  isOpen = false,
  onToggle,
}: ChatSidebarProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const {
    rooms,
    roomId,
    setRoomId,
    isLoadingRooms,
    loadRooms,
    createRoom,
    deleteRoom,
    selectedCharacterId,
    availableCharacters,
  } = useChatStore();

  const [operationState, setOperationState] = useState<OperationState>({
    deletingRoomId: null,
    isCreatingRoom: false,
    loadingRoomId: null,
  });

  const updateOperation = (updates: Partial<OperationState>) => {
    setOperationState((prev) => ({ ...prev, ...updates }));
  };

  // Filter rooms by selected character
  const filteredRooms = useMemo(() => {
    // Default Eliza agent ID (same as in rooms/route.ts)
    const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

    if (!selectedCharacterId) {
      // Show rooms with no character assignment OR default Eliza ID
      return rooms.filter(
        (room) => !room.characterId || room.characterId === DEFAULT_AGENT_ID,
      );
    }
    // Show rooms for the selected character
    return rooms.filter((room) => room.characterId === selectedCharacterId);
  }, [rooms, selectedCharacterId]);

  // Find selected character details
  const selectedCharacter = availableCharacters.find(
    (c) => c.id === selectedCharacterId,
  );

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Load rooms on mount (loadRooms from Zustand is stable)
  useEffect(() => {
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const handleNewChat = async () => {
    if (operationState.isCreatingRoom) return; // Prevent double-clicking

    updateOperation({ isCreatingRoom: true });
    // Create room with currently selected character
    const newRoomId = await createRoom(selectedCharacterId);
    if (newRoomId) {
      setRoomId(newRoomId);
      // Update URL with new room ID and current character
      const params = new URLSearchParams();
      params.set("roomId", newRoomId);
      if (selectedCharacterId) {
        params.set("characterId", selectedCharacterId);
      }
      router.push(`/dashboard/chat?${params.toString()}`);
    }
    updateOperation({ isCreatingRoom: false });
  };

  const handleSelectRoom = (selectedRoomId: string) => {
    // Show loading state on the button
    updateOperation({ loadingRoomId: selectedRoomId });
    setRoomId(selectedRoomId);
    // Update URL with selected room ID and current character
    const params = new URLSearchParams();
    params.set("roomId", selectedRoomId);
    if (selectedCharacterId) {
      params.set("characterId", selectedCharacterId);
    }
    router.push(`/dashboard/chat?${params.toString()}`);
  };

  // Clear loading state when roomId changes
  useEffect(() => {
    if (
      roomId &&
      operationState.loadingRoomId &&
      roomId === operationState.loadingRoomId
    ) {
      // Small delay to show the loading state
      const timer = setTimeout(() => {
        updateOperation({ loadingRoomId: null });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [roomId, operationState.loadingRoomId]);

  const handleDeleteRoom = async (roomIdToDelete: string) => {
    updateOperation({ deletingRoomId: roomIdToDelete });
    await deleteRoom(roomIdToDelete);
    updateOperation({ deletingRoomId: null });

    // If the deleted room was the current room, clear URL params
    if (roomId === roomIdToDelete) {
      const params = new URLSearchParams();
      if (selectedCharacterId) {
        params.set("characterId", selectedCharacterId);
      }
      router.push(`/dashboard/chat?${params.toString()}`);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "flex h-full flex-col border-r border-white/10 bg-[#0A0A0A] transition-transform duration-300 ease-in-out",
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
            : "w-64",
          className,
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4">
          {/* Corner brackets for logo area */}
          <CornerBrackets size="sm" className="opacity-30" />

          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
          >
            <Image
              src="/eliza-font.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className="h-5 w-auto"
            />
          </Link>

          {/* Mobile Close Button */}
          {isMobile && onToggle && (
            <button
              onClick={onToggle}
              className="rounded-none p-2 hover:bg-white/10 focus:bg-white/10 focus:outline-none relative z-10 transition-colors"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Back Button */}
        <div className="border-b border-white/10 px-4 py-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back</span>
          </Link>
        </div>

        {/* Selected Character Profile with New Chat Icon */}
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {/* Character Avatar */}
            <ElizaAvatar
              avatarUrl={selectedCharacter?.avatarUrl}
              name={selectedCharacter?.name || "Eliza"}
              className="w-8 h-8 flex-shrink-0"
              iconClassName="h-4 w-4"
              fallbackClassName="bg-[#FF5800]/10"
            />

            {/* Character Info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {selectedCharacter?.name || "Eliza"}
              </div>
              <div className="text-[10px] text-white/40 truncate">
                {filteredRooms.length} chat
                {filteredRooms.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* New Chat Button */}
            <LockOnButton
              onClick={handleNewChat}
              disabled={operationState.isCreatingRoom}
              size="sm"
            >
              {operationState.isCreatingRoom ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </LockOnButton>
          </div>
        </div>

        {/* Rooms/Conversations List */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {isLoadingRooms && filteredRooms.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-white/40" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredRooms.map((room) => {
                const isDeleting = operationState.deletingRoomId === room.id;
                const isLoading = operationState.loadingRoomId === room.id;
                return (
                  <div
                    key={room.id}
                    className={cn(
                      "group relative w-full text-left rounded-sm transition-all duration-200",
                      "hover:bg-white/5",
                      roomId === room.id &&
                        "bg-white/10 border-l-2 border-[#FF5800]",
                      (isDeleting || isLoading) &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="relative overflow-hidden">
                      <button
                        onClick={() => handleSelectRoom(room.id)}
                        disabled={isDeleting || isLoading}
                        className={cn(
                          "w-full text-left px-2.5 py-2 transition-transform duration-200",
                          "group-hover:-translate-x-8",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 text-[#FF5800] mt-0.5 shrink-0 animate-spin" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 text-white/40 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <span className="text-[11px] font-medium text-white/90 truncate">
                                {room.title || "New Chat"}
                              </span>
                              {room.lastTime && !isLoading && (
                                <span className="text-[10px] text-white/30 shrink-0">
                                  {formatTimestamp(room.lastTime)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room.id);
                        }}
                        disabled={isDeleting}
                        className={cn(
                          "absolute top-0 right-0 h-full w-8 flex items-center justify-center",
                          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                          "hover:bg-red-500/10 text-white/60 hover:text-red-400",
                        )}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredRooms.length === 0 && !isLoadingRooms && (
                <div className="px-3 py-6 text-center">
                  <MessageSquare className="h-8 w-8 text-white/15 mx-auto mb-2" />
                  <p className="text-[10px] text-white/40">No chats yet</p>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User Settings Panel */}
        <SidebarBottomPanel />
      </aside>
    </>
  );
}
