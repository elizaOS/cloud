"use client";

import { CharacterLibraryCard } from "./character-library-card";
import { EmptyState } from "./empty-state";
import type { ElizaCharacter } from "@/lib/types";
import type { ViewMode } from "./my-agents-client";

interface CharacterLibraryGridProps {
  characters: ElizaCharacter[];
  viewMode: ViewMode;
  onCreateNew: () => void;
}

export function CharacterLibraryGrid({
  characters,
  viewMode,
  onCreateNew,
}: CharacterLibraryGridProps) {
  if (characters.length === 0) {
    return <EmptyState onCreateNew={onCreateNew} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-0 gap-y-8">
      {characters.map((character) => (
        <CharacterLibraryCard
          key={character.id}
          character={character}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}
