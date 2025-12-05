"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  MessageSquare,
  Clock,
  Copy,
  Volume2,
  Rocket,
  Star,
  Tag,
  Sparkles,
} from "lucide-react";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import { getCategoryIcon } from "@/lib/constants/character-categories";
import { formatDistanceToNow } from "date-fns";
import { isBuiltInAvatar, ensureAvatarUrl } from "@/lib/utils/default-avatar";

interface CharacterDetailsModalProps {
  character: ExtendedCharacter | null;
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (character: ExtendedCharacter) => void;
  onClone: (character: ExtendedCharacter) => void;
}

export function CharacterDetailsModal({
  character,
  isOpen,
  onClose,
  onStartChat,
  onClone,
}: CharacterDetailsModalProps) {
  if (!character) return null;

  const bioText = Array.isArray(character.bio)
    ? character.bio.join(" ")
    : character.bio;

  const hasVoice = character.plugins?.includes("@elizaos/plugin-elevenlabs");
  const isDeployed = character.stats?.deploymentStatus === "deployed";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 overflow-hidden">
              <Image
                src={ensureAvatarUrl(character.avatarUrl)}
                alt={character.name}
                fill
                className="rounded-full object-cover"
                unoptimized={!isBuiltInAvatar(character.avatarUrl)}
              />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-xl">{character.name}</div>
              {character.username && (
                <div className="text-sm text-muted-foreground font-normal">
                  @{character.username}
                </div>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap gap-2 pt-2">
            {character.isTemplate && (
              <Badge variant="secondary">
                <Star className="h-3 w-3 mr-1" />
                Template
              </Badge>
            )}
            {character.featured && (
              <Badge variant="secondary">
                <Star className="h-3 w-3 mr-1 fill-current" />
                Featured
              </Badge>
            )}
            {isDeployed && (
              <Badge variant="default" className="bg-green-600">
                <Rocket className="h-3 w-3 mr-1" />
                Live
              </Badge>
            )}
            {hasVoice && (
              <Badge variant="secondary">
                <Volume2 className="h-3 w-3 mr-1" />
                Voice Enabled
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Bio */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                About
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {bioText}
              </p>
            </div>

            {/* Category */}
            {character.category && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Category
                </h3>
                <Badge variant="outline" className="text-sm">
                  <span className="mr-1">
                    {getCategoryIcon(character.category)}
                  </span>
                  {character.category}
                </Badge>
              </div>
            )}

            {/* Topics */}
            {character.topics && character.topics.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {character.topics.map((topic) => (
                    <Badge key={topic} variant="outline">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {character.tags && character.tags.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {character.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Adjectives */}
            {character.adjectives && character.adjectives.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Personality Traits
                </h3>
                <div className="flex flex-wrap gap-2">
                  {character.adjectives.map((adj) => (
                    <Badge key={adj} variant="outline" className="capitalize">
                      {adj}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Plugins */}
            {character.plugins && character.plugins.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Capabilities
                </h3>
                <div className="space-y-1">
                  {character.plugins.map((plugin) => (
                    <div key={plugin} className="text-sm text-muted-foreground">
                      •{" "}
                      {plugin
                        .replace("@elizaos/plugin-", "")
                        .replace(/-/g, " ")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {character.stats && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Usage Statistics
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Messages</div>
                    <div className="font-semibold">
                      {character.stats.messageCount.toLocaleString()}
                    </div>
                  </div>
                  {character.stats.lastActiveAt && (
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Last Active</div>
                      <div className="font-semibold">
                        {formatDistanceToNow(
                          new Date(character.stats.lastActiveAt),
                          { addSuffix: true },
                        )}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Status</div>
                    <Badge
                      variant={
                        character.stats.deploymentStatus === "deployed"
                          ? "default"
                          : "outline"
                      }
                      className="w-fit"
                    >
                      {character.stats.deploymentStatus}
                    </Badge>
                  </div>
                  {character.viewCount !== undefined && (
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Views</div>
                      <div className="font-semibold">
                        {character.viewCount.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            className="flex-1"
            onClick={() => {
              onStartChat(character);
              onClose();
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Start Chat
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onClone(character);
              onClose();
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Clone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
