"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface CharacterCardProps {
  character: ExtendedCharacter;
  onStartChat: (character: ExtendedCharacter) => void;
  onClone: (character: ExtendedCharacter) => void;
  onViewDetails: (character: ExtendedCharacter) => void;
}

export function CharacterCard({
  character,
  onStartChat,
  onClone,
  onViewDetails,
}: CharacterCardProps) {
  const bioText = Array.isArray(character.bio)
    ? character.bio[0]
    : character.bio;

  const hasVoice = character.plugins?.includes("@elizaos/plugin-elevenlabs");

  const isDeployed = character.stats?.deploymentStatus === "deployed";

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <CardContent className="p-0">
        {/* Character Avatar/Header */}
        <div className="relative h-48 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
          {character.avatarUrl ? (
            <Image
              src={character.avatarUrl}
              alt={character.name}
              fill
              className="object-cover"
            />
          ) : (
            <Bot className="h-20 w-20 text-muted-foreground" />
          )}

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
        <div className="p-4 space-y-3">
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
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {bioText}
          </p>

          {/* Features */}
          <div className="flex flex-wrap gap-2 min-h-[28px]">
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
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {character.stats.messageCount > 1000
                  ? `${(character.stats.messageCount / 1000).toFixed(1)}k`
                  : character.stats.messageCount}
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

          {/* Actions */}
          <div className="flex gap-2 pt-2">
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
