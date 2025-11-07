"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CharacterMarketplace } from "@/components/marketplace";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { Button } from "@/components/ui/button";
import type { ExtendedCharacter } from "@/lib/types/marketplace";
import { toast } from "sonner";
import { MessageSquare, Edit } from "lucide-react";

export function AgentMarketplaceClient() {
  const router = useRouter();

  useSetPageHeader({
    title: "Agent Marketplace",
    description:
      "Discover and explore AI agents from the community. Find templates, clone characters, and start conversations.",
  });

  const handleSelectCharacter = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        console.log(
          "[Agent Marketplace] Character selected for chat:",
          character.name,
          character.id,
        );

        toast.success(`Opening chat with ${character.name}...`);

        router.push(`/dashboard/eliza?characterId=${character.id}`);
      } catch (error) {
        console.error("[Agent Marketplace] Error navigating to chat:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to open chat",
        );
      }
    },
    [router],
  );

  const handleCloneCharacter = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        console.log(
          "[Agent Marketplace] Cloning character:",
          character.name,
          character.id,
        );

        const response = await fetch(
          `/api/marketplace/characters/${character.id}/clone`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to clone character");
        }

        const result = await response.json();
        const clonedCharacterId = result.data?.id;

        console.log(
          "[Agent Marketplace] Character cloned successfully:",
          result.data,
        );

        // Enhanced success toast with actions
        toast.success(
          <div className="flex flex-col gap-3">
            <p className="font-medium">Cloned {character.name} to your library!</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => {
                  if (clonedCharacterId) {
                    router.push(`/dashboard/eliza?characterId=${clonedCharacterId}`);
                  }
                }}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Test in Chat
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (clonedCharacterId) {
                    router.push(`/dashboard/character-creator?id=${clonedCharacterId}`);
                  }
                }}
              >
                <Edit className="h-3 w-3 mr-1" />
                Customize
              </Button>
            </div>
          </div>,
          { duration: 6000 }
        );
      } catch (error) {
        console.error("[Agent Marketplace] Error cloning character:", error);
        throw error;
      }
    },
    [router],
  );

  return (
    <CharacterMarketplace
      onSelectCharacter={handleSelectCharacter}
      onCloneCharacter={handleCloneCharacter}
      isCollapsed={false}
    />
  );
}
