/**
 * Chat Sidebar Component
 * Special sidebar for the /chat page showing rooms/conversations
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  X,
  MessageSquare,
  Loader2,
  Trash2,
  Edit3,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerBrackets, BrandButton } from "@/components/brand";
import { useChatStore } from "@/stores/chat-store";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";
import { BuildModeBottomPanel } from "./build-mode-bottom-panel";
import { ChatSidebarBottomPanel } from "./chat-sidebar-bottom-panel";

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
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const isBuildMode = pathname?.includes("/build");
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
    console.log(
      `[ChatSidebar] Filtering rooms: total=${rooms.length}, selectedCharacterId=${selectedCharacterId}`
    );

    if (!selectedCharacterId) {
      // Show rooms with no character assignment (default Eliza)
      const filtered = rooms.filter((room) => !room.characterId);
      console.log(
        `[ChatSidebar] No character selected, showing ${filtered.length} rooms without character`
      );
      return filtered;
    }

    // Show rooms for the selected character
    const filtered = rooms.filter(
      (room) => room.characterId === selectedCharacterId
    );
    console.log(
      `[ChatSidebar] Character selected, showing ${filtered.length} rooms for character ${selectedCharacterId}`
    );
    return filtered;
  }, [rooms, selectedCharacterId]);

  // Find selected character details
  const selectedCharacter = availableCharacters.find(
    (c) => c.id === selectedCharacterId
  );

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Load rooms on mount - Zustand functions are stable, so empty deps array is safe
  useEffect(() => {
    console.log("[ChatSidebar] Mounting, loading rooms");
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = async () => {
    if (isCreatingRoom) return; // Prevent double-clicking

    setIsCreatingRoom(true);
    try {
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
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleSelectRoom = (selectedRoomId: string) => {
    // Show loading state on the button
    setLoadingRoomId(selectedRoomId);
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
          onKeyDown={(e) => {
            if (e.key === "Escape") onToggle?.();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "flex h-full flex-col border-r border-white/10 bg-[#0A0A0A] transition-transform duration-300 ease-in-out",
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
            : "w-64",
          className
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
              type="button"
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
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors cursor-pointer"
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
          </button>
        </div>

        {/* Selected Character Profile with New Chat Icon */}
        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Character Avatar */}
              <div className="relative shrink-0">
                <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
                  {selectedCharacter?.avatarUrl ? (
                    <Image
                      src={selectedCharacter.avatarUrl}
                      alt={selectedCharacter.name}
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image
                      src="/avatars/eliza-chibi.png"
                      alt="Eliza"
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>

              {/* Character Info */}
              <div className="flex flex-col justify-center">
                <p
                  className="truncate"
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 500,
                    fontSize: "14px",
                    lineHeight: "normal",
                    letterSpacing: "-0.042px",
                    color: "#dfdfdf",
                  }}
                >
                  {selectedCharacter?.name || "Zilo"}
                </p>
                <p
                  className="truncate opacity-50"
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 500,
                    fontSize: "10px",
                    lineHeight: "normal",
                    color: "#a1a1a1",
                  }}
                >
                  {filteredRooms.length} Interaction{filteredRooms.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Edit Icon Button */}
            <button
              onClick={handleNewChat}
              disabled={isCreatingRoom}
              className="shrink-0 p-1 hover:bg-white/5 rounded-none transition-colors"
              title="Edit agent"
            >
              {isCreatingRoom ? (
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#dfdfdf" }} />
              ) : (
                <Edit3 className="h-6 w-6" style={{ color: "#dfdfdf" }} />
              )}
            </button>
          </div>
        </div>

        {/* Rooms/Conversations List */}
        <nav className="flex-1 overflow-y-auto px-6 py-4">
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
                      "group relative w-full text-left rounded-none transition-colors",
                      (isDeleting || isLoading) &&
                      "opacity-50 pointer-events-none"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectRoom(room.id)}
                      disabled={isDeleting || isLoading}
                      className={cn(
                        "w-full text-left px-2.5 py-2.5",
                        roomId === room.id ? "bg-neutral-900" : "hover:bg-neutral-900/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 text-[#FF5800] shrink-0 animate-spin" />
                        ) : (
                          <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "#adadad" }} />
                        )}
                        <p
                          className="truncate"
                          style={{
                            fontFamily: "var(--font-roboto-mono)",
                            fontWeight: 400,
                            fontSize: "14px",
                            lineHeight: "normal",
                            letterSpacing: "-0.042px",
                            color: "#a1a1a1",
                          }}
                        >
                          {room.title ||
                            `Room ID: ${room.id.substring(0, 8)}`}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoom(room.id);
                      }}
                      disabled={isDeleting}
                      className={cn(
                        "absolute top-2 right-2 p-1 rounded-none",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-red-500/10 hover:text-red-500"
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
                  <MessageSquare className="h-12 w-12 text-white/20 mx-auto mb-3" />
                  <p className="text-sm font-medium text-white/70 mb-2">
                    No conversations yet
                  </p>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Click &ldquo;New&rdquo; above or the button in chat to start
                  </p>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User Settings Panel */}
        {isBuildMode ? <BuildModeBottomPanel /> : <ChatSidebarBottomPanel />}
      </aside>
    </>
  );
}
