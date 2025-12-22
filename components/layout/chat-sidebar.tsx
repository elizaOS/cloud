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
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  X,
  MessageSquare,
  Loader2,
  Trash2,
  Copy,
  Check,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LockOnButton } from "@/components/brand";
import { useChatStore } from "@/lib/stores/chat-store";
import { SidebarBottomPanel } from "./sidebar-bottom-panel";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";

// Default Eliza avatars - different for build vs chat pages
const DEFAULT_ELIZA_AVATAR_CHAT =
  "https://raw.githubusercontent.com/elizaOS/eliza-avatars/refs/heads/master/Eliza/portrait.png";
const DEFAULT_ELIZA_AVATAR_BUILD = "/avatars/eliza-default.png";

interface ChatSidebarProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const TOKEN_ADDRESSES = [
  {
    name: "Solana",
    address: "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
    id: "solana",
  },
  {
    name: "Ethereum",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "ethereum",
  },
  {
    name: "Base",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "base",
  },
  {
    name: "Bsc",
    address: "0xea17Df5Cf6D172224892B5477A16ACb111182478",
    id: "bsc",
  },
] as const;

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
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  // Use different default avatar for build vs chat pages
  const isBuildPage = pathname.includes("/build");
  const defaultElizaAvatar = isBuildPage
    ? DEFAULT_ELIZA_AVATAR_BUILD
    : DEFAULT_ELIZA_AVATAR_CHAT;
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const tokensRef = useRef<HTMLDivElement>(null);
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

  const handleCloseClick = () => {
    onToggle?.();
  };

  const handleCopyAddress = async (address: string, network: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(network);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Handle click outside to close token display
  useEffect(() => {
    if (!showTokens) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (tokensRef.current && !tokensRef.current.contains(event.target as Node)) {
        setShowTokens(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTokens]);

  // Handle escape key to close token display
  useEffect(() => {
    if (!showTokens) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowTokens(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showTokens]);

  // Focus management - move focus to container when opened
  useEffect(() => {
    if (showTokens && tokensRef.current) {
      tokensRef.current.focus();
    }
  }, [showTokens]);

  // Filter rooms by selected character
  const filteredRooms = useMemo(() => {
    // Default Eliza agent ID (same as in rooms/route.ts)
    const DEFAULT_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

    if (!selectedCharacterId) {
      // Show rooms with no character assignment OR default Eliza ID
      return rooms.filter(
        (room) => !room.characterId || room.characterId === DEFAULT_AGENT_ID
      );
    }
    // Show rooms for the selected character
    return rooms.filter((room) => room.characterId === selectedCharacterId);
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
          className
        )}
      >
        {/* Header with Logo */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4 overflow-visible">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80 relative z-10"
          >
            <Image
              src="/cloudlogo.svg"
              alt="ELIZA"
              width={80}
              height={24}
              className={`invert shrink-0 ${isMobile ? "w-20" : "w-24"}`}
            />
          </Link>
          <div
            className={`flex items-center w-full ${
              isMobile ? "justify-start pl-4" : "justify-end"
            }`}
          >
            <div ref={tokensRef} tabIndex={-1}>
              {showTokens && (
                <div
                  id="token-addresses-chat-sidebar"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="token-title-chat-sidebar"
                  className="bg-[#0A0A0A] border border-white/10 p-4 sm:p-3 mt-2 w-[calc(100vw-1rem)] sm:w-[460px] max-w-[96vw] absolute top-full left-2 z-[60]"
                >
                  <div className="space-y-3">
                    <h3 id="token-title-chat-sidebar" className="text-xl font-mono font-bold text-brand-orange text-start border-b border-white/10 pb-3 sm:px-3">
                      elizaOS Token Addresses
                    </h3>
                    <div className="space-y-4 sm:space-y-0 font-mono text-sm">
                      {TOKEN_ADDRESSES.map((token) => (
                        <button
                          type="button"
                          key={token.id}
                          onClick={() =>
                            handleCopyAddress(token.address, token.id)
                          }
                          className="group/token flex flex-col w-full gap-1 sm:gap-0 hover:bg-brand-orange/10 sm:p-3"
                        >
                          <div className="flex items-end gap-1">
                            <span className="text-brand-orange font-semibold">
                              {token.name}
                            </span>
                            <div
                              className="transition-opacity p-1 hover:bg-brand-orange/10 rounded sm:hidden cursor-pointer"
                              role="button"
                              tabIndex={0}
                              aria-label={`Copy ${token.name} address`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCopyAddress(token.address, token.id);
                                }
                              }}
                            >
                              {copiedAddress === token.id ? (
                                <Check className="size-3.5 text-brand-orange" />
                              ) : (
                                <Copy className="size-3.5 text-white/70" />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 group">
                            <span className="text-white/70 break-all font-mono text-start tracking-tight sm:tracking-normal">
                              {token.address}
                            </span>
                            <div
                              className="hidden sm:flex shrink-0 opacity-100 sm:group-hover/token:opacity-100 sm:opacity-0 cursor-pointer"
                              role="button"
                              tabIndex={0}
                              aria-label={`Copy ${token.name} address`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCopyAddress(token.address, token.id);
                                }
                              }}
                            >
                              {copiedAddress === token.id ? (
                                <Check className="size-4 text-brand-orange" />
                              ) : (
                                <Copy className="size-4 text-white/70" />
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowTokens(!showTokens)}
                aria-expanded={showTokens}
                aria-controls="token-addresses-chat-sidebar"
                className="rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/20"
                aria-label="View token addresses"
              >
                <div className="size-8 rounded-full bg-brand-orange flex items-center justify-center p-[5px]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 37.19 42.14"
                    className="size-full"
                  >
                    <polygon points="29.75 4.96 29.75 2.48 27.27 2.48 24.79 2.48 22.31 2.48 22.31 0 19.83 0 17.35 0 14.87 0 14.87 2.48 12.4 2.48 9.92 2.48 9.92 4.96 12.4 4.96 14.87 4.96 17.35 4.96 19.83 4.96 22.31 4.96 24.79 4.96 24.79 7.44 27.27 7.44 29.75 7.44 32.23 7.44 32.23 4.96 29.75 4.96" />
                    <polygon points="32.23 12.4 29.75 12.4 29.75 14.87 29.75 17.35 32.23 17.35 32.23 14.87 34.71 14.87 34.71 12.4 32.23 12.4" />
                    <polygon points="34.71 14.87 34.71 17.35 34.71 19.83 37.19 19.83 37.19 17.35 37.19 14.87 34.71 14.87" />
                    <polygon points="22.31 9.92 19.83 9.92 17.35 9.92 14.87 9.92 14.87 7.44 12.4 7.44 9.92 7.44 7.44 7.44 7.44 9.92 4.96 9.92 4.96 12.4 4.96 14.87 4.96 17.35 4.96 19.83 4.96 22.31 2.48 22.31 2.48 24.79 2.48 27.27 2.48 29.75 2.48 32.23 2.48 34.71 0 34.71 0 37.19 0 39.66 2.48 39.66 2.48 42.14 4.96 42.14 7.44 42.14 7.44 39.66 9.92 39.66 9.92 37.19 12.4 37.19 12.4 34.71 12.4 32.23 12.4 29.75 12.4 27.27 12.4 24.79 9.92 24.79 9.92 22.31 9.92 19.83 9.92 17.35 12.4 17.35 14.87 17.35 14.87 19.83 17.35 19.83 19.83 19.83 19.83 17.35 19.83 14.87 22.31 14.87 24.79 14.87 24.79 12.4 24.79 9.92 22.31 9.92" />
                    <polygon points="29.75 32.23 29.75 34.71 29.75 37.19 27.27 37.19 27.27 34.71 24.79 34.71 22.31 34.71 22.31 37.19 22.31 39.66 22.31 42.14 24.79 42.14 24.79 39.66 27.27 39.66 27.27 42.14 29.75 42.14 32.23 42.14 32.23 39.66 32.23 37.19 32.23 34.71 32.23 32.23 29.75 32.23" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
          {/* Mobile Close Button */}
          {isMobile && onToggle && (
            <button
              onClick={handleCloseClick}
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
            {/* Character Avatar or Create New Agent Icon */}
            {selectedCharacter ? (
              <ElizaAvatar
                avatarUrl={selectedCharacter.avatarUrl}
                name={selectedCharacter.name}
                className="w-8 h-8 shrink-0"
                iconClassName="h-4 w-4"
                fallbackClassName="bg-[#FF5800]/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#FF5800]/20 border border-[#FF5800]/30 flex items-center justify-center shrink-0">
                <Plus className="h-4 w-4 text-[#FF5800]" />
              </div>
            )}

            {/* Character Info or Create New Agent */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {selectedCharacter?.name || "Create New Agent"}
              </div>
              {selectedCharacter && (
                <div className="text-[10px] text-white/40 truncate">
                  {filteredRooms.length} chat
                  {filteredRooms.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* New Chat Button or Create Agent Button */}
            {selectedCharacter ? (
              <LockOnButton
                onClick={handleNewChat}
                disabled={operationState.isCreatingRoom}
                size="sm"
                cornerSize="petite"
                className="shrink-0 h-7 px-3 text-xs"
              >
                {operationState.isCreatingRoom ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="text-base mb-0.5">+</span>
                )}
              </LockOnButton>
            ) : (
              <LockOnButton
                onClick={() => router.push("/dashboard/build")}
                size="sm"
                cornerSize="petite"
                className="shrink-0 h-7 px-3 text-xs"
              >
                <span className="text-xs">Build</span>
              </LockOnButton>
            )}
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
                        "opacity-50 pointer-events-none"
                    )}
                  >
                    <div className="relative">
                      <button
                        onClick={() => handleSelectRoom(room.id)}
                        disabled={isDeleting || isLoading}
                        className="w-full text-left px-2.5 py-2"
                      >
                        <div className="flex items-start gap-2">
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 text-[#FF5800] mt-0.5 shrink-0 animate-spin" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 text-white/40 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <span className="text-[11px] font-medium text-white/90 truncate">
                                {room.title || "New Chat"}
                              </span>
                              {room.lastTime && !isLoading && (
                                <span className="text-[10px] text-white/30 shrink-0 group-hover:opacity-0 transition-opacity duration-200">
                                  {formatTimestamp(room.lastTime)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                      {/* Delete button with gradient background overlay */}
                      <div
                        className={cn(
                          "absolute top-0 right-0 h-full flex items-center",
                          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                          "bg-gradient-to-l from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent",
                          "pl-4 pr-1"
                        )}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoom(room.id);
                          }}
                          disabled={isDeleting}
                          className={cn(
                            "h-6 w-6 flex items-center justify-center rounded",
                            "hover:bg-red-500/20 text-white/60 hover:text-red-400",
                            "transition-colors duration-150"
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
