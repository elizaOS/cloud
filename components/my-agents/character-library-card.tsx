/**
 * Character library card component displaying character information and actions.
 * Supports grid and list view modes with test, edit, duplicate, download, and delete actions.
 *
 * @param props - Character card configuration
 * @param props.character - Character data to display
 * @param props.viewMode - Display mode: "grid" or "list"
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Edit,
  Copy,
  Download,
  Trash2,
  MoreVertical,
  Bot,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { ElizaCharacter } from "@/lib/types";
import type { ViewMode } from "./my-agents-client";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";

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

  const handleTest = useCallback(() => {
    router.push(`/dashboard/chat?characterId=${character.id}`);
  }, [router, character.id]);

  const handleEdit = useCallback(() => {
    router.push(`/dashboard/build?characterId=${character.id}`);
  }, [router, character.id]);

  const handleDuplicate = useCallback(async () => {
    toast.info("Duplicating character...");

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
      // Navigate to edit the new character
      router.push(`/dashboard/build?characterId=${data.data.character.id}`);
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to duplicate character");
    }
  }, [router, character.id, character.name]);

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(character, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name || "character"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Character exported successfully");
  }, [character]);

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${character.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setIsDeleting(true);

    const response = await fetch(`/api/my-agents/characters/${character.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      toast.success(`Deleted ${character.name}`);
      router.refresh();
    } else {
      const error = await response.json();
      toast.error(error.error || "Failed to delete character");
      setIsDeleting(false);
    }
  }, [character.id, character.name, router]);

  const bio = Array.isArray(character.bio)
    ? character.bio[0] || ""
    : character.bio || "";

  const topicCount = character.topics?.length || 0;
  const pluginCount = character.plugins?.length || 0;

  if (viewMode === "list") {
    return (
      <BrandCard className="relative p-4 hover:border-[#FF5800]/50 transition-colors">
        <CornerBrackets size="sm" className="opacity-30" />
        <div className="relative z-10 flex items-center gap-4">
          {/* Avatar */}
          <ElizaAvatar
            avatarUrl={character.avatarUrl || character.avatar_url}
            name={character.name}
            className="flex-shrink-0 w-12 h-12"
            iconClassName="h-6 w-6"
            fallbackClassName="bg-[#FF5800]/20"
          />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white truncate">
              {character.name || "Unnamed Character"}
            </h3>
            <p className="text-sm text-white/60 truncate">{bio}</p>
            <div className="flex gap-2 mt-2">
              {topicCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {topicCount} topic{topicCount !== 1 ? "s" : ""}
                </Badge>
              )}
              {pluginCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {pluginCount} plugin{pluginCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleTest}
              className="bg-[#FF5800] hover:bg-[#FF5800]/90"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Test
            </Button>
            <Button size="sm" variant="outline" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </BrandCard>
    );
  }

  // Grid view
  return (
    <BrandCard className="relative p-6 hover:border-[#FF5800]/50 transition-colors group">
      <CornerBrackets size="sm" className="opacity-30" />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header with avatar and menu */}
        <div className="flex items-start justify-between mb-4">
          <ElizaAvatar
            avatarUrl={character.avatarUrl || character.avatar_url}
            name={character.name}
            className="w-16 h-16"
            iconClassName="h-8 w-8"
            fallbackClassName="bg-[#FF5800]/20"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Upload className="h-4 w-4 mr-2" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">
            {character.name || "Unnamed Character"}
          </h3>
          <p className="text-sm text-white/60 mb-4 line-clamp-3">{bio}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {topicCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {topicCount} topic{topicCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {pluginCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {pluginCount} plugin{pluginCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleTest}
            className="flex-1 bg-[#FF5800] hover:bg-[#FF5800]/90"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleEdit}
            className="flex-1"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
    </BrandCard>
  );
}
