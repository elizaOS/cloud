"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { CharacterMarketplace } from "@/components/marketplace";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { ExtendedCharacter } from "@/lib/types/marketplace";
import { toast } from "sonner";

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
        console.log(
          "[Agent Marketplace] Character cloned successfully:",
          result.data,
        );
        toast.success(`Cloned ${character.name} to your library`);
      } catch (error) {
        console.error("[Agent Marketplace] Error cloning character:", error);
        throw error;
      }
    },
    [],
  );

  return (
    <CharacterMarketplace
      onSelectCharacter={handleSelectCharacter}
      onCloneCharacter={handleCloneCharacter}
      isCollapsed={false}
    />
  );
}
