/**
 * Chat Sidebar Component
 * Special sidebar for the /chat page showing rooms/conversations
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
  Edit3,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "@/components/brand";
import { useChatStore } from "@/stores/chat-store";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";

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
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);

  // Filter rooms by selected character
  const filteredRooms = useMemo(() => {
    if (!selectedCharacterId) {
      // Show rooms with no character assignment (default Eliza)
      return rooms.filter((room) => !room.characterId);
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

  // Load rooms on mount
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleNewChat = async () => {
    if (isCreatingRoom) return; // Prevent double-clicking

    setIsCreatingRoom(true);
    try {
      // Create room with currently selected character
      const result = await createRoom(selectedCharacterId);
      if (result) {
        setRoomId(result.roomId);
        // Update URL with new room ID and resolved character
        const params = new URLSearchParams();
        params.set("roomId", result.roomId);
        const finalCharacterId = result.characterId || selectedCharacterId;
        if (finalCharacterId) {
          params.set("characterId", finalCharacterId);
        }
        router.push(`/dashboard/chat?${params.toString()}`);
      }
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleSelectRoom = (selectedRoomId: string) => {
    // Show loading state on the button
    setLoadingRoomId(selectedRoomId);
    setRoomId(selectedRoomId);

    // Find the room's characterId to preserve in URL
    const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
    const roomCharacterId = selectedRoom?.characterId;

    // Update URL with room ID and room's characterId
    // This keeps the dropdown selected and sidebar filtered correctly
    const params = new URLSearchParams();
    params.set("roomId", selectedRoomId);

    // Include the room's characterId if it exists
    if (roomCharacterId) {
      params.set("characterId", roomCharacterId);
    }

    router.push(`/dashboard/chat?${params.toString()}`);
  };

  // Clear loading state when roomId changes
  useEffect(() => {
    if (roomId && loadingRoomId && roomId === loadingRoomId) {
      // Small delay to show the loading state
      const timer = setTimeout(() => {
        setLoadingRoomId(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [roomId, loadingRoomId]);

  const handleDeleteRoom = async (roomIdToDelete: string) => {
    setDeletingRoomId(roomIdToDelete);
    await deleteRoom(roomIdToDelete);
    setDeletingRoomId(null);

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
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: "#FF5800" }}
            />
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
        <div className="border-b border-white/10 px-4 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            style={{
              fontFamily: "var(--font-roboto-mono)",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "18px",
              letterSpacing: "-0.003em",
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
        </div>

        {/* Selected Character Profile with New Chat Icon */}
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            {/* Character Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#FF5800]/10 flex items-center justify-center overflow-hidden">
                {selectedCharacter ? (
                  <Bot className="h-5 w-5 text-[#FF5800]" />
                ) : (
                  <Bot className="h-5 w-5 text-[#FF5800]" />
                )}
              </div>
            </div>

            {/* Character Info */}
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium text-white truncate"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 400,
                  fontSize: "14px",
                  lineHeight: "18px",
                  letterSpacing: "-0.003em",
                }}
              >
                {selectedCharacter?.name || "Eliza"}
              </div>
              <div
                className="text-xs text-white/60 truncate"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 400,
                  letterSpacing: "-0.003em",
                }}
              >
                {selectedCharacter
                  ? `${filteredRooms.length} interaction${filteredRooms.length !== 1 ? "s" : ""}`
                  : `${filteredRooms.length} interaction${filteredRooms.length !== 1 ? "s" : ""}`}
              </div>
            </div>

            {/* New Chat Icon Button */}
            <button
              onClick={handleNewChat}
              disabled={isCreatingRoom}
              className="flex-shrink-0 p-2 rounded-none hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="New chat"
            >
              {isCreatingRoom ? (
                <Loader2 className="h-4 w-4 text-white/80 animate-spin" />
              ) : (
                <Edit3 className="h-4 w-4 text-white/80" />
              )}
            </button>
          </div>
        </div>

        {/* Rooms/Conversations List */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {isLoadingRooms && filteredRooms.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/60" />
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRooms.map((room) => {
                const isDeleting = deletingRoomId === room.id;
                const isLoading = loadingRoomId === room.id;
                return (
                  <div
                    key={room.id}
                    className={cn(
                      "group relative w-full text-left px-3 py-3 rounded-none transition-colors",
                      "hover:bg-white/5",
                      roomId === room.id &&
                        "bg-white/10 border-l-2 border-[#FF5800]",
                      (isDeleting || isLoading) &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <button
                      onClick={() => handleSelectRoom(room.id)}
                      disabled={isDeleting || isLoading}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 text-[#FF5800] mt-0.5 shrink-0 animate-spin" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-white/60 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              className="text-sm font-medium text-white truncate"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontWeight: 400,
                                fontSize: "14px",
                                lineHeight: "18px",
                                letterSpacing: "-0.003em",
                              }}
                            >
                              {room.title ||
                                `Room ID: ${room.id.substring(0, 8)}`}
                            </span>
                            {room.lastTime && !isLoading && (
                              <span
                                className="text-xs text-white/40 shrink-0"
                                style={{
                                  fontFamily: "var(--font-roboto-mono)",
                                  fontWeight: 400,
                                  letterSpacing: "-0.003em",
                                }}
                              >
                                {formatTimestamp(room.lastTime)}
                              </span>
                            )}
                            {isLoading && (
                              <span
                                className="text-xs text-[#FF5800] shrink-0"
                                style={{
                                  fontFamily: "var(--font-roboto-mono)",
                                  fontWeight: 400,
                                  letterSpacing: "-0.003em",
                                }}
                              >
                                Loading...
                              </span>
                            )}
                          </div>
                          {room.lastText && (
                            <p
                              className="text-xs text-white/60 truncate"
                              style={{
                                fontFamily: "var(--font-roboto-mono)",
                                fontWeight: 400,
                                letterSpacing: "-0.003em",
                              }}
                            >
                              {room.lastText}
                            </p>
                          )}
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
                        "absolute top-3 right-3 p-1 rounded-none",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-red-500/10 hover:text-red-500",
                      )}
                      title="Delete conversation"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                );
              })}
              {filteredRooms.length === 0 && !isLoadingRooms && (
                <div
                  className="px-3 py-8 text-center"
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 400,
                    letterSpacing: "-0.003em",
                  }}
                >
                  <p className="text-xs text-white/60">No conversations yet</p>
                  <p className="text-xs text-white/40 mt-2">
                    Click the edit icon to start
                  </p>
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
