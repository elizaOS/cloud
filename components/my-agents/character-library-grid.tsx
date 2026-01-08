/**
 * Character library grid component displaying characters in grid or list view.
 * Shows empty state when no characters are available.
 * Supports both owned and saved agents with appropriate actions for each.
 *
 * @param props - Character library grid configuration
 * @param props.characters - Array of characters to display (owned and saved)
 * @param props.viewMode - Display mode (grid or list)
 * @param props.onCreateNew - Callback when create button is clicked
 * @param props.onRemoveSaved - Callback when a saved agent is removed
 */

"use client";

import { CharacterLibraryCard, type AgentWithOwnership } from "./character-library-card";
import { EmptyState } from "./empty-state";
import type { ViewMode } from "./my-agents-client";

interface CharacterLibraryGridProps {
  characters: AgentWithOwnership[];
  viewMode: ViewMode;
  onCreateNew: () => void;
  onRemoveSaved?: (characterId: string) => void;
}

export function CharacterLibraryGrid({
  characters,
  viewMode,
  onCreateNew,
  onRemoveSaved,
}: CharacterLibraryGridProps) {
  if (characters.length === 0) {
    return <EmptyState onCreateNew={onCreateNew} />;
  }

  return (
    <div
      className={
        viewMode === "grid"
          ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col gap-2"
      }
    >
      {characters.map((character) => (
        <div key={character.id} className={viewMode === "grid" ? "max-w-sm" : ""}>
          <CharacterLibraryCard
            character={character}
            viewMode={viewMode}
            onRemoveSaved={onRemoveSaved}
          />
        </div>
      ))}
    </div>
  );
}
