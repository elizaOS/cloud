"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import type { ElizaCharacter } from "@/lib/types";

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
}

export function ElizaPageClient({ initialCharacters }: ElizaPageClientProps) {
  const searchParams = useSearchParams();
  const [initialCharacterId, setInitialCharacterId] = useState<string | null>(
    null
  );

  useSetPageHeader({
    title: "Eliza Agent",
    description:
      "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  useEffect(() => {
    const characterId = searchParams.get("characterId");
    if (characterId) {
      console.log(
        "[Eliza Page] Character ID from URL:",
        characterId
      );
      setInitialCharacterId(characterId);
    }
  }, [searchParams]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <ElizaChatInterface
          availableCharacters={initialCharacters}
          initialCharacterId={initialCharacterId}
        />
      </div>
    </div>
  );
}
