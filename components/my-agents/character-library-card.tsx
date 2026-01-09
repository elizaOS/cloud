/**
 * Character library card component displaying character information and actions.
 * Supports grid and list view modes with duplicate, export, and delete actions.
 * Displays badges to indicate ownership and visibility status.
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Upload, Trash2, MoreHorizontal, Pencil, X, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import type { ViewMode } from "./my-agents-client";
import { Skeleton } from "@/components/ui/skeleton";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";

/**
 * Extended character type that includes ownership information.
 * Used to distinguish between owned agents and saved (public) agents.
 */
export interface AgentWithOwnership extends ElizaCharacter {
  /** Agent ID - required for display */
  id: string;
  /** Agent name - required for display */
  name: string;
  /** Whether the current user owns this agent */
  isOwned: boolean;
  /** For saved agents, the username of the owner */
  ownerUsername?: string;
  /** Whether the agent is public (for owned agents) */
  is_public?: boolean;
  isPublic?: boolean;
  /** Last interaction timestamp for saved agents */
  lastInteraction?: string;
  /** Updated at timestamp for owned agents */
  updated_at?: string;
}

interface CharacterLibraryCardProps {
  character: AgentWithOwnership;
  viewMode: ViewMode;
  /** Callback when a saved agent is removed */
  onRemoveSaved?: (characterId: string) => void;
}

/**
 * Renders a badge indicating ownership and visibility status.
 */
function OwnershipBadge({ character }: { character: AgentWithOwnership }) {
  const isPublic = character.is_public ?? character.isPublic;

  if (character.isOwned) {
    // Owned agent - show lock or globe based on visibility
    return (
      <span className="inline-flex items-center gap-1 text-xs text-white/70">
        {isPublic ? (
          <>
            <Globe className="h-3 w-3" />
            <span className="sr-only">Public</span>
          </>
        ) : (
          <>
            <Lock className="h-3 w-3" />
            <span className="sr-only">Private</span>
          </>
        )}
      </span>
    );
  }

  // Saved agent - show "by @username"
  return (
    <span className="text-xs text-white/50 truncate">
      by @{character.ownerUsername || "unknown"}
    </span>
  );
}

/**
 * Shared dropdown menu content for both grid and list views.
 */
function AgentDropdownMenuContent({
  character,
  onDuplicate,
  onExport,
  onDeleteClick,
  onRemoveSaved,
}: {
  character: AgentWithOwnership;
  onDuplicate: (e: React.MouseEvent) => void;
  onExport: (e: React.MouseEvent) => void;
  onDeleteClick: (e: React.MouseEvent) => void;
  onRemoveSaved: (e: React.MouseEvent) => void;
}) {
  if (character.isOwned) {
    return (
      <>
        <Link
          href={`/dashboard/build?characterId=${character.id}`}
          className="block h-full"
        >
          <DropdownMenuItem className="cursor-pointer">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport} className="cursor-pointer">
          <Upload className="h-4 w-4 mr-2" />
          Export JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDeleteClick}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </>
    );
  }

  // Saved agent menu options
  return (
    <>
      <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
        <Copy className="h-4 w-4 mr-2" />
        Fork Agent
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onRemoveSaved}
        className="cursor-pointer text-red-600 focus:text-red-600"
      >
        <X className="h-4 w-4 mr-2" />
        Remove
      </DropdownMenuItem>
    </>
  );
}

/**
 * Inline delete confirmation dialog overlay.
 */
function DeleteConfirmDialog({
  characterName,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  characterName: string;
  isDeleting: boolean;
  onConfirm: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-white/10 rounded-lg p-4 m-4 transform transition-all duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white mb-4">
          Delete <span className="font-semibold">{characterName}</span>?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * AlertDialog for removing saved agents.
 */
function RemoveConfirmDialog({
  open,
  onOpenChange,
  isRemoving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRemoving: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Agent?</AlertDialogTitle>
          <AlertDialogDescription>
            Your conversation history with this agent will be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isRemoving}
            className="bg-red-600 hover:bg-red-700"
          >
            {isRemoving ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CharacterLibraryCard({
  character,
  viewMode,
  onRemoveSaved,
}: CharacterLibraryCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDuplicate = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropdownOpen(false);

      toast.info("Duplicating character...");

      try {
        const response = await fetch(
          `/api/my-agents/characters/${character.id}/clone`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: `${character.name} (Copy)` }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          toast.success(`Created "${data.data.character.name}"`);
          router.refresh();
          router.push(`/dashboard/build?characterId=${data.data.character.id}`);
        } else {
          const error = await response.json();
          toast.error(error.error || "Failed to duplicate character");
        }
      } catch {
        toast.error("Failed to duplicate character");
      }
    },
    [router, character.id, character.name],
  );

  const handleExport = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropdownOpen(false);

      const dataStr = JSON.stringify(character, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${character.name || "character"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Character exported successfully");
    },
    [character],
  );

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

    const response = await fetch(`/api/my-agents/characters/${character.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      toast.success(`Deleted ${character.name}`);
      setShowDeleteConfirm(false);
      window.dispatchEvent(new Event("characters-updated"));
      router.refresh();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to delete character");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  // Handler for removing a saved agent
  const handleRemoveSaved = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowRemoveConfirm(true);
    },
    [],
  );

  const handleConfirmRemove = useCallback(async () => {
    if (!character.id) return;
    setIsRemoving(true);

    try {
      const response = await fetch(`/api/my-agents/saved/${character.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(`Removed ${character.name} from saved agents`);
        setShowRemoveConfirm(false);
        onRemoveSaved?.(character.id);
        window.dispatchEvent(new Event("characters-updated"));
        router.refresh();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to remove saved agent");
      }
    } catch {
      toast.error("Failed to remove saved agent");
    } finally {
      setIsRemoving(false);
      setShowRemoveConfirm(false);
    }
  }, [character.id, character.name, onRemoveSaved, router]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (showDeleteConfirm || showRemoveConfirm) {
      e.preventDefault();
    }
  };

  const bio = Array.isArray(character.bio)
    ? character.bio[0] || ""
    : character.bio || "";

  const avatarUrl = character.avatarUrl || character.avatar_url;

  const isListView = viewMode === "list";

  // Shared dropdown menu props
  const dropdownMenuProps = {
    character,
    onDuplicate: handleDuplicate,
    onExport: handleExport,
    onDeleteClick: handleDeleteClick,
    onRemoveSaved: handleRemoveSaved,
  };

  return (
    <>
      <Link
        href={`/dashboard/chat?characterId=${character.id}`}
        className={isListView ? "block" : "block h-full"}
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={
            isListView
              ? "group relative overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10"
              : "group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10 hover:-translate-y-1"
          }
        >
          {isListView ? (
            // List view layout
            <div className="relative z-10 flex items-center gap-4 p-4">
              {/* Avatar */}
              <div className="relative flex-shrink-0 w-12 h-12 overflow-hidden rounded-md">
                <Skeleton className="absolute inset-0 w-full h-full" />
                <Image
                  src={ensureAvatarUrl(avatarUrl)}
                  alt={character.name}
                  fill
                  className="object-cover"
                  unoptimized={!isBuiltInAvatar(avatarUrl)}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
                    {character.name || "Unnamed Character"}
                  </h3>
                  <OwnershipBadge character={character} />
                </div>
                <p className="text-sm text-white/50 truncate">{bio}</p>
              </div>

              {/* Remove button for saved agents (shown on hover) */}
              {!character.isOwned && isHovered && (
                <button
                  type="button"
                  onClick={handleRemoveSaved}
                  className="flex items-center justify-center h-8 w-8 rounded-md bg-transparent hover:bg-red-600/20 transition-colors"
                  title="Remove from saved"
                >
                  <X className="h-4 w-4 text-white/70 hover:text-red-500" />
                </button>
              )}

              {/* Dropdown Menu */}
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger
                  className="flex items-center justify-center h-8 w-8 rounded-md bg-transparent hover:bg-white/10 transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreHorizontal className="h-4 w-4 text-white" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <AgentDropdownMenuContent {...dropdownMenuProps} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            // Grid view layout
            <>
              {/* Avatar Section */}
              <div className="relative aspect-square w-full overflow-hidden">
                <Skeleton className="absolute inset-0 w-full h-full" />
                <Image
                  src={ensureAvatarUrl(avatarUrl)}
                  alt={character.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  unoptimized={!isBuiltInAvatar(avatarUrl)}
                />
                {/* Gradient overlay at top */}
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/90 to-transparent" />
              </div>

              {/* Ownership badge in top left */}
              <div className="absolute top-2 left-2">
                <OwnershipBadge character={character} />
              </div>

              {/* Remove button for saved agents (shown on hover) */}
              {!character.isOwned && isHovered && (
                <button
                  type="button"
                  onClick={handleRemoveSaved}
                  className="absolute top-2 right-10 z-10 flex items-center justify-center h-8 w-8 rounded-md bg-black/50 backdrop-blur-sm hover:bg-red-600/50 transition-colors"
                  title="Remove from saved"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              )}

              {/* Dropdown Menu */}
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger
                  className="absolute select-none right-0 m-2 flex items-center justify-center h-8 w-8 rounded-md bg-transparent backdrop-blur-sm hover:bg-black/70 transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreHorizontal className="h-4 w-4 text-white" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <AgentDropdownMenuContent {...dropdownMenuProps} />
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Content Section */}
              <div className="p-4 space-y-2">
                <h3 className="font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
                  {character.name || "Unnamed Character"}
                </h3>
                <p className="text-xs text-white/50 line-clamp-2 leading-relaxed min-h-[2rem]">
                  {bio || "No description yet"}
                </p>
              </div>
            </>
          )}

          {/* Delete Confirmation Dialog - shared between both views */}
          {showDeleteConfirm && (
            <DeleteConfirmDialog
              characterName={character.name}
              isDeleting={isDeleting}
              onConfirm={handleConfirmDelete}
              onCancel={handleCancelDelete}
            />
          )}
        </div>
      </Link>

      {/* Remove Saved Agent Confirmation Dialog - shared between both views */}
      <RemoveConfirmDialog
        open={showRemoveConfirm}
        onOpenChange={setShowRemoveConfirm}
        isRemoving={isRemoving}
        onConfirm={handleConfirmRemove}
      />
    </>
  );
}
