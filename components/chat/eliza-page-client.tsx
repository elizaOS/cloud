"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CornerBrackets } from "@/components/brand";
import type { ElizaCharacter } from "@/lib/types";

interface ElizaPageClientProps {
  initialCharacters: ElizaCharacter[];
}

export function ElizaPageClient({ initialCharacters }: ElizaPageClientProps) {
  const searchParams = useSearchParams();
  const [initialCharacterId, setInitialCharacterId] = useState<string | null>(
    null,
  );

  useSetPageHeader({
    title: "Eliza Agent",
    description:
      "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
  });

  useEffect(() => {
    const characterId = searchParams.get("characterId");
    if (characterId) {
      console.log("[Eliza Page] Character ID from URL:", characterId);
      // Set character ID asynchronously to avoid cascading renders
      Promise.resolve().then(() => {
        setInitialCharacterId(characterId);
      });
    }
  }, [searchParams]);

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-0 flex-col gap-6 overflow-hidden">
      <div className="relative flex flex-1 min-h-0 overflow-hidden rounded-none border border-white/10 bg-black/40">
        {/* Corner brackets */}
        <CornerBrackets
          size="md"
          variant="full-border"
          className="m-2 opacity-50"
        />

        <ElizaChatInterface
          availableCharacters={initialCharacters}
          initialCharacterId={initialCharacterId}
        />
      </div>
    </div>
  );
}
