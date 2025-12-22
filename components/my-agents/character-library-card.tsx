/**
 * Character library card component displaying character information and actions.
 * Supports grid and list view modes with duplicate, export, and delete actions.
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
import { Copy, Upload, Trash2, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import type { ViewMode } from "./my-agents-client";
import { Skeleton } from "@/components/ui/skeleton";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";

interface CharacterLibraryCardProps {
  character: ElizaCharacter;
  viewMode: ViewMode;
}

export function CharacterLibraryCard({
  character,
  viewMode,
}: CharacterLibraryCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleDuplicate = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropdownOpen(false);

      toast.info("Duplicating character...");

      const response = await fetch(
        `/api/my-agents/characters/${character.id}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${character.name} (Copy)` }),
        }
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
    },
    [router, character.id, character.name]
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
    [character]
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

  const handleCardClick = (e: React.MouseEvent) => {
    if (showDeleteConfirm) {
      e.preventDefault();
    }
  };

  const bio = Array.isArray(character.bio)
    ? character.bio[0] || ""
    : character.bio || "";

  const avatarUrl = character.avatarUrl || character.avatar_url;

  if (viewMode === "list") {
    return (
      <Link
        href={`/dashboard/chat?characterId=${character.id}`}
        className="block"
        onClick={handleCardClick}
      >
        <div className="group relative overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10">
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
              <h3 className="text-lg font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
                {character.name || "Unnamed Character"}
              </h3>
              <p className="text-sm text-white/50 truncate">{bio}</p>
            </div>

            {/* Dropdown Menu */}
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger
                className="flex items-center justify-center h-8 w-8 rounded-md bg-transparent hover:bg-white/10 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                <MoreHorizontal className="h-4 w-4 text-white" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <Link
                  href={`/dashboard/build?characterId=${character.id}`}
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
                  onClick={handleDeleteClick}
                  className="cursor-pointer text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
                  Delete{" "}
                  <span className="font-semibold">{character.name}</span>?
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
        </div>
      </Link>
    );
  }

  // Grid view
  return (
    <Link
      href={`/dashboard/chat?characterId=${character.id}`}
      className="block h-full"
      onClick={handleCardClick}
    >
      <div className="group relative h-full overflow-hidden border border-white/10 bg-black/40 transition-all duration-300 hover:border-[#FF5800]/50 hover:shadow-lg hover:shadow-[#FF5800]/10 hover:-translate-y-1">
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

        {/* Three dots menu */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger
            className="absolute select-none right-0 m-2 flex items-center justify-center h-8 w-8 rounded-md bg-transparent backdrop-blur-sm hover:bg-black/70 transition-colors"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-4 w-4 text-white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <Link
              href={`/dashboard/build?characterId=${character.id}`}
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
              onClick={handleDeleteClick}
              className="cursor-pointer text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
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
                Delete <span className="font-semibold">{character.name}</span>?
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
          <h3 className="font-semibold text-white truncate group-hover:text-[#FF5800] transition-colors">
            {character.name || "Unnamed Character"}
          </h3>
          <p className="text-xs text-white/50 line-clamp-2 leading-relaxed min-h-[2rem]">
            {bio || "No description yet"}
          </p>
        </div>
      </div>
    </Link>
  );
}
