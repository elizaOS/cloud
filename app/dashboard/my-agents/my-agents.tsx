"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { MyAgentsView } from "@/components/marketplace";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import { toast } from "sonner";

export function MyAgentsClient() {
  const router = useRouter();

  const handleSelectCharacter = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        toast.success(`Opening chat with ${character.name}...`);

        router.push(`/dashboard/chat?characterId=${character.id}`);
      } catch (error) {
        console.error("[My Agents] Error navigating to chat:", error);
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
        const response = await fetch(
          `/api/my-agents/characters/${character.id}/clone`,
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
        toast.success(`Cloned ${character.name} to your library`);
      } catch (error) {
        console.error("[My Agents] Error cloning character:", error);
        throw error;
      }
    },
    [],
  );

  return (
    <MyAgentsView
      onSelectCharacter={handleSelectCharacter}
      onCloneCharacter={handleCloneCharacter}
      isCollapsed={false}
    />
  );
}
