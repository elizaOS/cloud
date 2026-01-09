/**
 * Agents section component displaying user's agents in a card grid layout.
 * Shows a "Getting Started" guide when user has fewer than 3 agents.
 * Displays up to 4 agents on dashboard with a "View all" link if more exist.
 *
 * @param props - Agents section configuration
 * @param props.agents - Array of agent objects to display
 * @param props.className - Additional CSS classes
 */

"use client";

import * as React from "react";
import { BrandButton, CornerBrackets } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bot,
  Plus,
  Sparkles,
  HelpCircle,
  Rocket,
  Terminal,
  Copy,
  Check,
  Zap,
  BookOpen,
  ExternalLink,
  Pencil,
  Trash2,
  MoreHorizontal,
  Upload,
  Globe,
  Lock,
  Link as LinkIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardAgentStats as AgentStats } from "@/lib/actions/dashboard";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/chat-store";

interface Agent {
  id: string;
  name: string;
  bio: string | string[];
  avatarUrl: string | null;
  category: string | null;
  isPublic: boolean;
  username?: string | null;
  stats?: AgentStats;
}

interface AgentsSectionProps {
  agents: Agent[];
  className?: string;
}

export function AgentsSection({ agents, className }: AgentsSectionProps) {
  // Show max 4 agents on dashboard (2x2 grid)
  const displayAgents = agents.slice(0, 4);
  const hasMore = agents.length > 4;
  const showGettingStarted = agents.length < 3;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Getting Started - Show when user has few agents */}
      {showGettingStarted && <GettingStartedSection />}

      {/* Section Header */}
      <div className="flex h-12 items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/my-agents"
              className="text-xl font-semibold text-white transition-colors duration-200 hover:text-orange-500"
            >
              My Agents
            </Link>
            <span className="text-sm text-white/30">({agents.length})</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-white/20 hover:text-white/50 transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-[180px] text-xs bg-zinc-900 text-white/80 border border-white/10"
              >
                Your AI characters. Chat, deploy, or integrate via API.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {agents.length != 0 && (
          <BrandButton
            onClick={() => (window.location.href = "/dashboard/build")}
            className="bg-[#FF5800] text-black hover:bg-[#FF5800]/90 active:bg-[#FF5800]/80"
          >
            <Plus className="h-4 w-4" />
            Create New Agent
          </BrandButton>
        )}
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <AgentsEmptyState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* View All Link */}
          {hasMore && (
            <div className="flex justify-center">
              <BrandButton
                variant="ghost"
                asChild
                size="sm"
                className="text-xs h-8"
              >
                <Link href="/dashboard/my-agents">
                  View all ({agents.length})
                </Link>
              </BrandButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Getting Started Section with CLI commands
function GettingStartedSection() {
  const [copiedCreate, setCopiedCreate] = React.useState(false);
  const [copiedDeploy, setCopiedDeploy] = React.useState(false);

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-[#FF5800]/5 via-black/40 to-purple-900/10 p-6">
      <div className="pointer-events-none absolute inset-0 z-10">
        <CornerBrackets size="md" color="#E1E1E1" />
      </div>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF5800]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-lg bg-[#FF5800]/10 border border-[#FF5800]/20">
            <Zap className="h-5 w-5 text-[#FF5800]" />
          </div>
          <h3 className="text-lg font-semibold text-white">Quick Start</h3>
        </div>

        {/* CLI Commands */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Create Command */}
          <div className="group relative rounded-lg border border-white/10 bg-black/30 p-3 hover:border-[#FF5800]/30 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-4 w-4 text-[#FF5800]" />
              <span className="text-sm font-medium text-white">Create</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded bg-black/50 text-sm font-mono text-emerald-400 border border-white/5">
                npx elizaos create
              </code>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard("npx elizaos create", setCopiedCreate)
                }
                className="p-2 rounded hover:bg-white/5 transition-colors text-white/40 hover:text-white"
              >
                {copiedCreate ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Deploy Command */}
          <div className="group relative rounded-lg border border-white/10 bg-black/30 p-3 hover:border-[#FF5800]/30 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-white">Deploy</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded bg-black/50 text-sm font-mono text-purple-400 border border-white/5">
                npx elizaos deploy
              </code>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard("npx elizaos deploy", setCopiedDeploy)
                }
                className="p-2 rounded hover:bg-white/5 transition-colors text-white/40 hover:text-white"
              >
                {copiedDeploy ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/5">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-[#FF5800] transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
            <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            href="/dashboard/build"
            className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-[#FF5800] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Create in Browser
          </Link>
        </div>
      </div>
    </div>
  );
}

// Generate a consistent color based on agent name
function getAgentColor(name: string): string {
  const colors = [
    "from-[#FF5800] to-orange-700",
    "from-purple-500 to-indigo-700",
    "from-emerald-500 to-teal-700",
    "from-blue-500 to-cyan-700",
    "from-pink-500 to-rose-700",
    "from-amber-500 to-yellow-700",
    "from-violet-500 to-purple-700",
    "from-cyan-500 to-blue-700",
  ];
  const index =
    name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;
  return colors[index];
}

// Individual Agent Card - Full card style with prominent avatar
function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();
  const { loadRooms, rooms } = useChatStore();
  const bioText = Array.isArray(agent.bio) ? agent.bio[0] : agent.bio;
  const isDeployed = agent.stats?.deploymentStatus === "deployed";
  const isStopped = agent.stats?.deploymentStatus === "stopped";
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [isPublic, setIsPublic] = React.useState(agent.isPublic);

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);

    toast.info("Duplicating agent...");

    const response = await fetch(
      `/api/my-agents/characters/${agent.id}/clone`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${agent.name} (Copy)` }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      toast.success(`Created "${data.data.character.name}"`);
      router.refresh();
      router.push(`/dashboard/build?characterId=${data.data.character.id}`);
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to duplicate agent");
    }
  };

  const handleExport = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);

    const dataStr = JSON.stringify(agent, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${agent.name || "agent"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Agent exported successfully");
  };

  const handleToggleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newIsPublic = !isPublic;
    setIsPublic(newIsPublic); // Optimistic update

    try {
      const response = await fetch(
        `/api/my-agents/characters/${agent.id}/share`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: newIsPublic }),
        },
      );

      if (response.ok) {
        toast.success(
          newIsPublic ? "Agent is now public" : "Agent is now private",
        );
      } else {
        setIsPublic(!newIsPublic); // Revert on error
        toast.error("Failed to update sharing");
      }
    } catch {
      setIsPublic(!newIsPublic); // Revert on error
      toast.error("Failed to update sharing");
    }
  };

  const handleCopyShareLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);

    if (!agent.username) {
      toast.error("Set a username first to share this agent");
      return;
    }
    const shareUrl = `${window.location.origin}/chat/@${agent.username}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied!");
    } catch {
      toast.error("Failed to copy link to clipboard");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    const response = await fetch(`/api/my-agents/characters/${agent.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      toast.success("Agent deleted");
      setShowDeleteConfirm(false);
      window.dispatchEvent(new Event("characters-updated"));
      router.refresh();
    } else {
      toast.error("Failed to delete agent");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const handleCardClick = async (e: React.MouseEvent) => {
    if (showDeleteConfirm) {
      e.preventDefault();
      return;
    }

    e.preventDefault();

    // Ensure rooms are loaded
    if (rooms.length === 0) {
      await loadRooms();
    }

    const currentRooms = useChatStore.getState().rooms;
    const characterRooms = currentRooms
      .filter((r) => r.characterId === agent.id)
      .sort((a, b) => (b.lastTime ?? 0) - (a.lastTime ?? 0));

    if (characterRooms.length > 0) {
      router.push(
        `/dashboard/chat?characterId=${agent.id}&roomId=${characterRooms[0].id}`,
      );
    } else {
      router.push(`/dashboard/chat?characterId=${agent.id}`);
    }
  };

  return (
    <div
      className="block h-full cursor-pointer"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ")
          handleCardClick(e as unknown as React.MouseEvent);
      }}
      role="button"
      tabIndex={0}
    >
      <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10 hover:-translate-y-1">
        <div className={cn("relative aspect-square w-full overflow-hidden")}>
          <Skeleton className="absolute inset-0 w-full h-full" />

          <Image
            src={ensureAvatarUrl(agent.avatarUrl)}
            alt={agent.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            priority
            unoptimized={!isBuiltInAvatar(agent.avatarUrl)}
          />

          {/* Gradient overlay at bottom */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/90 to-transparent" />
          {/* Three dots menu - TOP LEFT */}

          {/* Status badges */}
          <div className="absolute top-2 right-2 z-20 flex gap-1.5">
            {isDeployed && (
              <Badge className="bg-emerald-500/90 text-[10px] px-2 py-0.5 backdrop-blur-sm border-0">
                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse mr-1" />
                Live
              </Badge>
            )}
            {isStopped && (
              <Badge className="bg-amber-500/80 text-[10px] px-2 py-0.5 backdrop-blur-sm border-0 text-black">
                Stopped
              </Badge>
            )}
          </div>
        </div>

        <div className="w-full">
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger className="absolute select-none right-0 m-2 flex items-center justify-center h-8 w-8 rounded-md bg-transparent backdrop-blur-sm hover:bg-black/70 transition-colors">
              <MoreHorizontal className="h-4 w-4 text-white" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <Link
                href={`/dashboard/build?characterId=${agent.id}`}
                className="block h-full"
              >
                <DropdownMenuItem className="cursor-pointer">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem
                onClick={handleDuplicate}
                className="cursor-pointer"
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExport}
                className="cursor-pointer"
              >
                <Upload className="h-4 w-4 mr-2" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleToggleShare}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="flex items-center">
                  {isPublic ? (
                    <Globe className="h-4 w-4 mr-4 text-green-500" />
                  ) : (
                    <Lock className="h-4 w-4 mr-4" />
                  )}
                  {isPublic ? "Public" : "Private"}
                </span>
                <Switch
                  checked={isPublic}
                  className="pointer-events-none data-[state=checked]:bg-green-500/20 [&_[data-slot=switch-thumb]]:data-[state=checked]:bg-green-500 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:bg-white/40"
                />
              </DropdownMenuItem>
              {isPublic && (
                <DropdownMenuItem
                  onClick={handleCopyShareLink}
                  className="cursor-pointer"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Share
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteClick}
                className="cursor-pointer text-red-500 bg-red-500/10 hover:bg-red-500/20 focus:bg-red-500/20 focus:text-red-500"
              >
                <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Delete Confirmation Dialog */}
          {showDeleteConfirm && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200"
              onClick={handleCancelDelete}
            >
              <div
                className="bg-zinc-900 border border-white/10 rounded-lg p-4 m-4 transform transition-all duration-200 scale-100"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm text-white mb-4">
                  Delete <span className="font-semibold">{agent.name}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="flex-1 px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="flex-1 px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content Section */}
          <div className="p-4 space-y-2">
            {/* Name */}
            <h3 className="font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
              {agent.name}
            </h3>

            {/* Bio */}
            <p className="text-xs text-white/50 line-clamp-2 leading-relaxed min-h-[2rem]">
              {bioText || "No description yet"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Empty State
function AgentsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center relative min-h-[240px] gap-4">
      <CornerBrackets size="md" color="#E1E1E1" />
      <h3 className="text-lg font-medium text-neutral-500">No agents yet</h3>
      <BrandButton
        onClick={() => (window.location.href = "/dashboard/build")}
        className="bg-[#FF5800] text-black hover:bg-[#FF5800]/90 active:bg-[#FF5800]/80"
      >
        <Plus className="h-4 w-4" />
        Create New Agent
      </BrandButton>
    </div>
  );
}

// Skeleton Loader - matches new card style
export function AgentsSectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Getting Started Skeleton */}
      <div className="relative border border-white/10 bg-black/20 p-6">
        <div className="pointer-events-none absolute inset-0 z-10">
          <CornerBrackets size="md" color="#E1E1E1" />
        </div>
        <div className="relative z-0 flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-white/10 animate-pulse rounded" />
            <div className="h-3 w-48 bg-white/10 animate-pulse rounded" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>

      {/* Section Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-28 bg-white/10 animate-pulse rounded" />
          <div className="h-5 w-8 bg-white/10 animate-pulse rounded" />
        </div>
        <div className="h-9 w-20 bg-white/10 animate-pulse rounded" />
      </div>

      {/* Agents Grid Skeleton - Card style */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="relative border border-white/10 bg-black/40 overflow-hidden"
          >
            <div className="pointer-events-none absolute inset-0 z-10">
              <CornerBrackets size="md" color="#E1E1E1" />
            </div>
            {/* Avatar area skeleton */}
            <div className="h-36 w-full bg-gradient-to-br from-white/5 to-white/[0.02] animate-pulse" />

            {/* Content skeleton */}
            <div className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-white/10 animate-pulse rounded" />
              <div className="space-y-1.5">
                <div className="h-3 w-full bg-white/10 animate-pulse rounded" />
                <div className="h-3 w-2/3 bg-white/10 animate-pulse rounded" />
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                <div className="h-3 w-20 bg-white/10 animate-pulse rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
