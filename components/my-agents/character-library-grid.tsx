/**
 * Character library grid component displaying characters in grid or list view.
 * Shows empty state when no characters are available.
 *
 * @param props - Character library grid configuration
 * @param props.characters - Array of characters to display
 * @param props.viewMode - Display mode (grid or list)
 * @param props.onCreateNew - Callback when create button is clicked
 */

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
    <div
      className={
        viewMode === "grid"
          ? "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4   gap-3"
          : "flex flex-col gap-3"
      }
    >
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
