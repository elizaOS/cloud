"use client";

import { useState, useCallback } from "react";
import { MyAgentsHeader } from "./marketplace-header";
import { FilterBar } from "./filter-bar";
import { CharacterGrid } from "./character-grid";
import { CharacterDetailsModal } from "./character-details-modal";
import { useMyAgentsFilters } from "./hooks/use-marketplace-filters";
import { useCharacterSearch } from "./hooks/use-character-search";
import { useInfiniteCharacters } from "./hooks/use-infinite-characters";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import { toast } from "sonner";

interface MyAgentsViewProps {
  onSelectCharacter: (character: ExtendedCharacter) => void;
  onCloneCharacter: (character: ExtendedCharacter) => Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function MyAgentsView({
  onSelectCharacter,
  onCloneCharacter,
  isCollapsed = false,
  onToggleCollapse,
}: MyAgentsViewProps) {
  const [selectedCharacter, setSelectedCharacter] =
    useState<ExtendedCharacter | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const {
    activeCategory,
    sortBy,
    setSortBy,
    filters,
    toggleFilter,
    clearAllFilters,
    hasActiveFilters,
  } = useMyAgentsFilters();

  const { searchQuery, setSearchQuery, debouncedSearchQuery } =
    useCharacterSearch();

  const {
    characters,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
  } = useInfiniteCharacters({
    filters: {
      ...filters,
      category: activeCategory || undefined,
      search: debouncedSearchQuery || undefined,
    },
    sortBy,
    includeStats: true,
  });

  const handleStartChat = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        // Track interaction
        await fetch(
          `/api/my-agents/characters/${character.id}/track-interaction`,
          { method: "POST" },
        );

        onSelectCharacter(character);
        // Note: Toast is shown in my-agents.tsx to avoid duplicate
      } catch (error) {
        console.error("Error tracking interaction:", error);
        onSelectCharacter(character);
      }
    },
    [onSelectCharacter],
  );

  const handleViewDetails = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        // Track view
        await fetch(`/api/my-agents/characters/${character.id}/track-view`, {
          method: "POST",
        });
      } catch (error) {
        console.error("Error tracking view:", error);
      }

      setSelectedCharacter(character);
    },
    [],
  );

  const handleClone = useCallback(
    async (character: ExtendedCharacter) => {
      try {
        await onCloneCharacter(character);
        toast.success(`Cloned ${character.name} to your library`);
        refetch();
      } catch (error) {
        console.error("Error cloning character:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to clone character",
        );
      }
    },
    [onCloneCharacter, refetch],
  );

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <MyAgentsHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        view={view}
        onViewChange={setView}
        onToggleCollapse={onToggleCollapse}
      />

      {/* <CategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      /> */}

      <FilterBar
        sortBy={sortBy}
        onSortChange={setSortBy}
        filters={filters}
        onToggleFilter={toggleFilter}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
      />

      <CharacterGrid
        characters={characters}
        view={view}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={loadMore}
        onStartChat={handleStartChat}
        onCloneCharacter={handleClone}
        onViewDetails={handleViewDetails}
      />

      <CharacterDetailsModal
        character={selectedCharacter}
        isOpen={!!selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
        onStartChat={handleStartChat}
        onClone={handleClone}
      />
    </div>
  );
}
