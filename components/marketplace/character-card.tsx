/**
 * Character card component for displaying character information in grid or list view.
 * Shows avatar, bio, stats, and action buttons for chatting, cloning, and viewing details.
 *
 * @param props - Character card configuration
 * @param props.character - Character data to display
 * @param props.view - Display mode: "grid" (card layout) or "list" (compact horizontal)
 * @param props.onStartChat - Callback when chat button is clicked
 * @param props.onClone - Callback when clone button is clicked
 * @param props.onViewDetails - Callback when details button is clicked
 */

"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  MessageSquare,
  Clock,
  Copy,
  Info,
  Volume2,
  Rocket,
  Star,
} from "lucide-react";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import {
  getCategoryIcon,
  getCategoryColor,
} from "@/lib/constants/character-categories";
import { formatDistanceToNow } from "date-fns";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";

interface CharacterCardProps {
  character: ExtendedCharacter;
  view?: "grid" | "list";
  onStartChat: (character: ExtendedCharacter) => void;
  onClone: (character: ExtendedCharacter) => void;
  onViewDetails: (character: ExtendedCharacter) => void;
}

export function CharacterCard({
  character,
  view = "grid",
  onStartChat,
  onClone,
  onViewDetails,
}: CharacterCardProps) {
  const bioText = Array.isArray(character.bio)
    ? character.bio[0]
    : character.bio;

  const hasVoice = character.plugins?.includes("@elizaos/plugin-elevenlabs");
  const isDeployed = character.stats?.deploymentStatus === "deployed";

  // List view - compact horizontal layout
  if (view === "list") {
    return (
      <Card className="group overflow-hidden transition-all duration-200 hover:shadow-md hover:bg-accent/50 p-0 gap-0">
        <CardContent className="p-3 flex items-center gap-4">
          {/* Avatar - Small icon */}
          <div className="relative h-12 w-12 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Image
              src={ensureAvatarUrl(character.avatarUrl)}
              alt={character.name}
              fill
              className="object-cover"
              unoptimized={!isBuiltInAvatar(character.avatarUrl)}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                {character.name}
              </h3>
              {character.isTemplate && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Template
                </Badge>
              )}
              {isDeployed && (
                <Badge
                  variant="default"
                  className="bg-green-600/90 text-[10px] px-1.5 py-0"
                >
                  <Rocket className="h-2.5 w-2.5 mr-0.5" />
                  Live
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {bioText}
            </p>
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {character.stats?.roomCount ?? 0}
            </span>
            {hasVoice && (
              <span className="flex items-center gap-1">
                <Volume2 className="h-3 w-3" />
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              className="h-8"
              onClick={() => onStartChat(character)}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Chat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onClone(character)}
              title="Clone"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onViewDetails(character)}
              title="Details"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view - card layout
  return (
    <Card className="rounded-none group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 p-0 gap-0 h-full">
      <CardContent className="p-0 h-full flex flex-col">
        {/* Character Avatar/Header */}
        <div className="relative h-48 flex-shrink-0 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden">
          <Image
            src={ensureAvatarUrl(character.avatarUrl)}
            alt={character.name}
            fill
            className="object-cover"
            unoptimized={!isBuiltInAvatar(character.avatarUrl)}
          />

          {/* Status Badges */}
          <div className="absolute top-2 right-2 flex gap-2">
            {character.featured && (
              <Badge
                variant="secondary"
                className="backdrop-blur-sm bg-background/80"
              >
                <Star className="h-3 w-3 mr-1 fill-current" />
                Featured
              </Badge>
            )}
            {character.isTemplate && (
              <Badge
                variant="secondary"
                className="backdrop-blur-sm bg-background/80"
              >
                <Star className="h-3 w-3 mr-1" />
                Template
              </Badge>
            )}
            {isDeployed && (
              <Badge
                variant="default"
                className="backdrop-blur-sm bg-green-600/90"
              >
                <Rocket className="h-3 w-3 mr-1" />
                Live
              </Badge>
            )}
          </div>
        </div>

        {/* Character Info */}
        <div className="p-4 flex flex-col flex-1">
          {/* Name & Category */}
          <div>
            <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
              {character.name}
            </h3>
            {character.username && (
              <p className="text-sm text-muted-foreground">
                @{character.username}
              </p>
            )}
            {character.category && (
              <Badge variant="outline" className="mt-1">
                <span className="mr-1">
                  {getCategoryIcon(character.category)}
                </span>
                {character.category}
              </Badge>
            )}
          </div>

          {/* Bio */}
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mt-3">
            {bioText}
          </p>

          {/* Features */}
          <div className="flex flex-wrap gap-2 min-h-[28px] mt-3">
            {hasVoice && (
              <Badge variant="secondary" className="text-xs">
                <Volume2 className="h-3 w-3 mr-1" />
                Voice
              </Badge>
            )}
            {character.topics?.slice(0, 2).map((topic) => (
              <Badge key={topic} variant="outline" className="text-xs">
                {topic}
              </Badge>
            ))}
            {character.topics && character.topics.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{character.topics.length - 2}
              </Badge>
            )}
          </div>

          {/* Stats */}
          {character.stats && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 mt-3 border-t">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {(character.stats.roomCount ?? 0) > 1000
                  ? `${((character.stats.roomCount ?? 0) / 1000).toFixed(1)}k`
                  : (character.stats.roomCount ?? 0)}{" "}
                chats
              </span>
              {character.stats.lastActiveAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(character.stats.lastActiveAt), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
          )}

          {/* Actions - Always at bottom */}
          <div className="flex gap-2 pt-3 mt-auto">
            <Button
              className="flex-1"
              size="sm"
              onClick={() => onStartChat(character)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onClone(character)}
              title="Clone character"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(character)}
              title="View details"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loading component for character cards.
 *
 * @param props - Skeleton configuration
 * @param props.view - Display mode: "grid" or "list"
 */
interface CharacterCardSkeletonProps {
  view?: "grid" | "list";
}

export function CharacterCardSkeleton({
  view = "grid",
}: CharacterCardSkeletonProps) {
  // List view skeleton
  if (view === "list") {
    return (
      <Card className="overflow-hidden p-0 gap-0">
        <CardContent className="p-3 flex items-center gap-4">
          {/* Avatar skeleton */}
          <Skeleton className="h-12 w-12 flex-shrink-0 rounded-lg" />

          {/* Info skeleton */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>

          {/* Stats skeleton */}
          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            <Skeleton className="h-4 w-12" />
          </div>

          {/* Actions skeleton */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view skeleton
  return (
    <Card className="overflow-hidden p-0 gap-0 h-full">
      <CardContent className="p-0 h-full flex flex-col">
        {/* Image skeleton */}
        <Skeleton className="h-48 w-full rounded-t-xl rounded-b-none" />

        {/* Content skeleton */}
        <div className="p-4 flex flex-col flex-1 space-y-3">
          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>

          {/* Bio */}
          <div className="space-y-1.5 mt-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>

          {/* Tags */}
          <div className="flex gap-2 mt-3">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 pt-3 mt-3 border-t">
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-3 mt-auto">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
