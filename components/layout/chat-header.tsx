/**
 * Chat header component for the /chat page.
 * Supports switching to build mode and sidebar toggle.
 *
 * @param props - Chat header configuration
 * @param props.onToggleSidebar - Optional callback to toggle sidebar visibility
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  ChevronDown,
  ChevronLeft,
  Wrench,
  Check,
  Copy,
  Globe,
  Lock,
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
import { toast } from "sonner";

interface ChatHeaderProps {
  onToggleSidebar?: () => void;
}

export function ChatHeader({ onToggleSidebar }: ChatHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedCharacterId } = useChatStore();

  // Share status state
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  // Derive mode from pathname
  const mode = pathname.includes("/build") ? "build" : "chat";
  const isBuildPage = mode === "build";

  // Fetch share status when character changes
  // Only shows share controls if user owns the character (API returns 404 otherwise)
  useEffect(() => {
    if (!selectedCharacterId) {
      setIsPublic(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchShareStatus = async () => {
      try {
        const res = await fetch(
          `/api/my-agents/characters/${selectedCharacterId}/share`,
          { signal: controller.signal }
        );

        if (cancelled) return;

        // 403/404 means user doesn't own this character - hide share controls
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
        // Ignore abort errors
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
  }, [selectedCharacterId]);

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    if (!selectedCharacterId) return;

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${baseUrl}/chat/${selectedCharacterId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Toggle share status
  const handleToggleShare = async () => {
    if (!selectedCharacterId) return;

    try {
      const response = await fetch(
        `/api/my-agents/characters/${selectedCharacterId}/share`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: !isPublic }),
        }
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

  const handleModeChange = (newMode: "chat" | "build") => {
    if (newMode === mode) return;

    // Can't switch to chat mode without an agent - need to create one first
    if (newMode === "chat" && !selectedCharacterId) {
      return;
    }

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
    <header className="flex h-16 items-center justify-between backdrop-blur-3xl px-2 md:px-3">
      <div className="flex items-center gap-1.5">
        {/* Mobile Menu Button - only show when sidebar is available (chat mode) */}
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
            className="flex items-center justify-center size-10 border border-transparent hover:border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="size-5" />
          </Link>
        )}

      </div>

      {/* Mode Toggle + Share - Only show when an agent is selected */}
      {selectedCharacterId && (
        <div className="flex items-center gap-2">
          {/* Share Dropdown - Hidden, moved to agent card menu */}
          {false && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-none transition-colors",
                    "border border-white/10 bg-black/40 hover:bg-white/5",
                    "focus:outline-none focus:ring-2 focus:ring-[#FF5800]/50",
                    isPublic && "border-green-500/30"
                  )}
                  title={isPublic ? "Public - Anyone can chat" : "Private"}
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
                      <span
                        className={isPublic ? "text-white" : "text-white/40"}
                      >
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
          )}

          {/* Edit Button */}
          <button
            onClick={() => handleModeChange("build")}
            className="flex items-center gap-2 px-4 h-10 rounded-2xl border border-transparent hover:border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/80 hover:text-white"
          >
            <Wrench className="h-4 w-4" />
            <span>Edit</span>
          </button>
        </div>
      )}
    </header>
  );
}
