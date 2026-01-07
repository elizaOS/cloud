/**
 * Chat header component for the /chat page with agent picker and mode toggle.
 * Renders different UI based on viewer state:
 * - Owner: Full controls (dropdown, edit, share toggle)
 * - Non-owner (authenticated): Static display, copy agent button
 * - Unauthenticated: Static display, copy link only
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  ChevronDown,
  ChevronLeft,
  MessageSquare,
  Wrench,
  Plus,
  Check,
  Copy,
  Globe,
  Lock,
  Link2,
  GitFork,
} from "lucide-react";
import { BrandButton } from "@/components/brand";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/lib/stores/chat-store";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";
import { toast } from "sonner";

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
    viewerState,
    isAuthenticated,
  } = useChatStore();

  // Share status state (only fetched for owners)
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Derive mode from pathname
  const mode = pathname.includes("/build") ? "build" : "chat";
  const isBuildPage = mode === "build";

  // Find selected agent
  const selectedAgent = availableCharacters.find(
    (a) => a.id === selectedCharacterId,
  );

  // Determine if user is the owner of the selected character
  const isOwner = viewerState === "owner";

  // Fetch share status when character changes (only for owners)
  useEffect(() => {
    if (!selectedCharacterId || !isOwner) {
      setIsPublic(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchShareStatus = async () => {
      try {
        const res = await fetch(
          `/api/my-agents/characters/${selectedCharacterId}/share`,
          { signal: controller.signal },
        );

        if (cancelled) return;

        if (res.status === 403 || res.status === 404) {
          setIsPublic(null);
          return;
        }

        if (!res.ok) {
          setIsPublic(null);
          return;
        }

        const data = await res.json();
        if (!cancelled && data?.success) {
          setIsPublic(data.data.isPublic);
        } else if (!cancelled) {
          setIsPublic(null);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!cancelled) {
          setIsPublic(null);
        }
      }
    };

    fetchShareStatus();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCharacterId, isOwner]);

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    if (!selectedCharacterId) return;

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${baseUrl}/dashboard/chat?characterId=${selectedCharacterId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Fork (duplicate) agent to user's account
  const handleCopyAgent = async () => {
    if (!selectedCharacterId || !isAuthenticated) return;

    setIsCopying(true);
    try {
      const response = await fetch(
        `/api/my-agents/characters/${selectedCharacterId}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      const data = await response.json();
      const clonedId = data.data?.character?.id;
      if (data.success && clonedId) {
        toast.success(`Forked "${selectedAgent?.name}" to your account!`);
        router.push(`/dashboard/chat?characterId=${clonedId}`);
      } else {
        toast.error(data.error || "Failed to fork agent");
      }
    } catch {
      toast.error("Failed to fork agent");
    } finally {
      setIsCopying(false);
    }
  };

  // Toggle share status (owner only)
  const handleToggleShare = async () => {
    if (!selectedCharacterId || !isOwner) return;

    try {
      const response = await fetch(
        `/api/my-agents/characters/${selectedCharacterId}/share`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: !isPublic }),
        },
      );

      const data = await response.json();
      if (data.success) {
        setIsPublic(data.data.isPublic);
        toast.success(data.data.message);
      } else {
        toast.error(data.error || "Failed to update sharing");
      }
    } catch {
      toast.error("Failed to update sharing");
    }
  };

  const handleAgentChange = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setRoomId(null);

    const params = new URLSearchParams();
    params.set("characterId", characterId);
    const path = mode === "build" ? "/dashboard/build" : "/dashboard/chat";
    router.push(`${path}?${params.toString()}`);
  };

  const handleCreateNewAgent = () => {
    setSelectedCharacterId(null);
    setRoomId(null);
    router.push("/dashboard/build");
  };

  const handleModeChange = (newMode: "chat" | "build") => {
    if (newMode === mode) return;
    if (newMode === "chat" && !selectedCharacterId) return;

    const params = new URLSearchParams();
    if (selectedCharacterId) {
      params.set("characterId", selectedCharacterId);
    }

    const path = newMode === "build" ? "/dashboard/build" : "/dashboard/chat";
    const url = params.toString() ? `${path}?${params.toString()}` : path;
    router.push(url);
  };

  // ==========================================================================
  // RENDER: Static Agent Display (for non-owners and unauthenticated)
  // ==========================================================================
  const renderStaticAgentDisplay = () => (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-none",
        "border border-white/10 bg-black/40",
      )}
      data-testid="agent-name"
    >
      {selectedAgent ? (
        <div className="flex items-center gap-2">
          <ElizaAvatar
            avatarUrl={selectedAgent.avatarUrl}
            name={selectedAgent.name}
            className="w-6 h-6"
            iconClassName="h-3 w-3"
            fallbackClassName="bg-[#FF5800]"
            data-testid="agent-avatar"
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
          {/* Creator attribution for non-owners */}
          {viewerState === "non-owner" && selectedAgent.creatorUsername && (
            <span
              className="text-xs text-white/40 ml-2"
              data-testid="creator-attribution"
            >
              by @{selectedAgent.creatorUsername}
            </span>
          )}
        </div>
      ) : (
        <span className="text-sm text-white/60">No agent selected</span>
      )}
    </div>
  );

  // ==========================================================================
  // RENDER: Owner Agent Picker Dropdown
  // ==========================================================================
  const renderOwnerAgentPicker = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-none",
            "border border-white/10 bg-black/40",
            "hover:bg-white/5 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50",
          )}
          data-testid="agent-picker-dropdown"
        >
          {selectedAgent ? (
            <>
              <div className="flex items-center gap-2">
                <ElizaAvatar
                  avatarUrl={selectedAgent.avatarUrl}
                  name={selectedAgent.name}
                  className="w-6 h-6"
                  iconClassName="h-3 w-3"
                  fallbackClassName="bg-[#FF5800]"
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
                <div className="w-6 h-6 rounded-full bg-[#FF5800]/20 border border-[#FF5800]/30 flex items-center justify-center">
                  <Plus className="h-3 w-3 text-[#FF5800]" />
                </div>
                <span className="text-sm text-white">Create New Agent</span>
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
        <DropdownMenuItem
          onClick={handleCreateNewAgent}
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer",
            "hover:bg-white/5 focus:bg-white/5",
          )}
        >
          <div className="w-6 h-6 rounded-full bg-[#FF5800]/20 border border-[#FF5800]/30 flex items-center justify-center">
            <Plus className="h-3 w-3 text-[#FF5800]" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">
              Create New Agent
            </span>
          </div>
        </DropdownMenuItem>

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
                <ElizaAvatar
                  avatarUrl={character.avatarUrl}
                  name={character.name}
                  className="w-6 h-6"
                  iconClassName="h-3 w-3"
                  fallbackClassName="bg-[#FF5800]"
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
  );

  // ==========================================================================
  // RENDER: Owner Controls (Share + Mode Toggle)
  // ==========================================================================
  const renderOwnerControls = () => (
    <div className="flex items-center gap-2">
      {/* Share Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-none transition-colors",
              "border border-white/10 bg-black/40 hover:bg-white/5",
              "focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50",
              isPublic && "border-green-500/30",
            )}
            title={isPublic ? "Public - Anyone can chat" : "Private"}
            data-testid="share-toggle"
          >
            {isPublic ? (
              <Globe className="h-4 w-4 text-green-500" />
            ) : (
              <Lock className="h-4 w-4 text-white/60" />
            )}
            <span className="hidden md:inline text-sm text-white/80">
              {isPublic ? "Public" : "Private"}
            </span>
            <ChevronDown className="h-3 w-3 text-white/40" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 bg-[#0A0A0A] border-white/10"
        >
          <DropdownMenuItem
            onClick={handleToggleShare}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
            data-testid="toggle-visibility"
          >
            {isPublic ? (
              <>
                <Lock className="h-4 w-4 text-white/60" />
                <span className="text-white">Make Private</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 text-green-500" />
                <span className="text-white">Make Public</span>
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            onClick={handleCopyShareLink}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
            disabled={!isPublic}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-white/60" />
                <span className={isPublic ? "text-white" : "text-white/40"}>
                  Copy Share Link
                </span>
              </>
            )}
          </DropdownMenuItem>
          {!isPublic && (
            <div className="px-3 py-2 text-xs text-white/40">
              Make your agent public to share
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mode Toggle */}
      <div className="flex items-center rounded-none border border-white/10 bg-black/40">
        <button
          onClick={() => handleModeChange("chat")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors border-0",
            mode === "chat"
              ? "bg-[#471E08] text-white"
              : "bg-[#1F1F1F] text-[#ADADAD] hover:text-white",
          )}
          data-testid="chat-mode-btn"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden md:inline">Chat</span>
        </button>
        <button
          onClick={() => handleModeChange("build")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors border-0",
            mode === "build"
              ? "bg-[#2D1505] text-white"
              : "bg-[#1F1F1F] text-[#ADADAD] hover:text-white",
          )}
          data-testid="edit-mode-btn"
        >
          <Wrench
            className={cn(
              "h-4 w-4",
              mode === "build" ? "text-[#FF5800]" : "text-white",
            )}
          />
          <span className="hidden md:inline">Edit</span>
        </button>
      </div>
    </div>
  );

  // ==========================================================================
  // RENDER: Non-Owner Controls (Chat + Copy Agent + Copy Link)
  // ==========================================================================
  const renderNonOwnerControls = () => (
    <div className="flex items-center gap-2">
      {/* Chat button (always active for non-owners viewing public agent) */}
      <button
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors",
          "border border-white/10 bg-[#471E08] text-white",
        )}
        data-testid="chat-mode-btn"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden md:inline">Chat</span>
      </button>

      {/* Fork Agent button (authenticated non-owners only) */}
      {isAuthenticated && (
        <button
          onClick={handleCopyAgent}
          disabled={isCopying}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors",
            "border border-white/10 bg-black/40 hover:bg-white/5",
            "text-white/80 hover:text-white",
            isCopying && "opacity-50 cursor-not-allowed",
          )}
          data-testid="copy-agent-btn"
        >
          <GitFork className="h-4 w-4" />
          <span className="hidden md:inline">
            {isCopying ? "Forking..." : "Fork"}
          </span>
        </button>
      )}

      {/* Copy Link button */}
      <button
        onClick={handleCopyShareLink}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors",
          "border border-white/10 bg-black/40 hover:bg-white/5",
          "text-white/80 hover:text-white",
        )}
        data-testid="copy-link-btn"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        <span className="hidden md:inline">{copied ? "Copied!" : "Share"}</span>
      </button>
    </div>
  );

  // ==========================================================================
  // RENDER: Unauthenticated Controls (Copy Link only)
  // ==========================================================================
  const renderUnauthenticatedControls = () => (
    <div className="flex items-center gap-2">
      {/* Copy Link button */}
      <button
        onClick={handleCopyShareLink}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-none transition-colors",
          "border border-white/10 bg-black/40 hover:bg-white/5",
          "text-white/80 hover:text-white",
        )}
        data-testid="copy-link-btn"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        <span className="hidden md:inline">{copied ? "Copied!" : "Share"}</span>
      </button>
    </div>
  );

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-transparent backdrop-blur-3xl px-4 md:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        {onToggleSidebar && (
          <BrandButton
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5 text-white" />
          </BrandButton>
        )}

        {/* Back to Dashboard - only on build page */}
        {isBuildPage && (
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-7 h-7 text-white/40 hover:text-white hover:bg-white/5 rounded transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}

        {/* Agent Display: Dropdown for owners OR on build page (allows unauthenticated users to create agents) */}
        {/* On chat page, non-owners see static display with creator attribution */}
        {isOwner || isBuildPage ? renderOwnerAgentPicker() : renderStaticAgentDisplay()}
      </div>

      {/* Right-side Controls - Only show when an agent is selected */}
      {selectedCharacterId && (
        <>
          {isOwner && renderOwnerControls()}
          {viewerState === "non-owner" && renderNonOwnerControls()}
          {viewerState === "unauthenticated" && renderUnauthenticatedControls()}
        </>
      )}
    </header>
  );
}
