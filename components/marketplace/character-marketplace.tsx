"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { MyAgentsHeader } from "./marketplace-header";
import { CategoryTabs } from "./category-tabs";
import { FilterBar } from "./filter-bar";
import { CharacterGrid } from "./character-grid";
import { CharacterDetailsModal } from "./character-details-modal";
import { useMyAgentsFilters } from "./hooks/use-marketplace-filters";
import { useCharacterSearch } from "./hooks/use-character-search";
import { useInfiniteCharacters } from "./hooks/use-infinite-characters";
import type { ExtendedCharacter } from "@/lib/types/my-agents";
import { toast } from "sonner";
import { DEMO_AGENTS } from "@/lib/data/demo-agents";

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
    setActiveCategory,
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

  const handleCreateNew = useCallback(() => {
    // Navigate to build mode with no characterId (new agent creation)
    window.location.href = "/dashboard/chat?mode=build";
  }, []);

  // Show characters normally, no demo agent fallback
  const displayCharacters = useMemo(() => {
    return characters;
  }, [characters]);

  const showEmptyState = characters.length === 0 && !isLoading && !error;

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header with New Agent Button - Exact Figma specs */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex flex-col gap-[8px] max-w-[455px]">
          <div className="flex gap-[16px] items-start">
            <h1
              className="font-['Roboto_Mono'] font-medium text-[#e1e1e1] text-[24px] leading-normal"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              My Agents
            </h1>
          </div>
          <p
            className="font-['Roboto_Mono'] font-normal text-[#858585] text-[16px] leading-normal w-full"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Explore Agents that you have created or saved
          </p>
        </div>

        {/* New Agent Button - Exact Figma specs: px-[12px] py-[8px], gap-[6px] */}
        <button
          onClick={handleCreateNew}
          className="relative bg-[rgba(255,88,0,0.25)] flex gap-[6px] items-center px-[12px] py-[8px] group hover:bg-[rgba(255,88,0,0.3)] transition-colors"
        >
          {/* Corner Brackets - positioned at corners */}
          <div className="absolute top-0 left-0 w-2 h-2 pointer-events-none">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M8 0L0 0L0 8" stroke="#FF5800" strokeWidth="1" />
            </svg>
          </div>
          <div className="absolute top-0 right-0 w-2 h-2 pointer-events-none">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M0 0L8 0L8 8" stroke="#FF5800" strokeWidth="1" />
            </svg>
          </div>
          <div className="absolute bottom-0 left-0 w-2 h-2 pointer-events-none">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M8 8L0 8L0 0" stroke="#FF5800" strokeWidth="1" />
            </svg>
          </div>
          <div className="absolute bottom-0 right-0 w-2 h-2 pointer-events-none">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M0 8L8 8L8 0" stroke="#FF5800" strokeWidth="1" />
            </svg>
          </div>

          <Plus className="w-[18px] h-[18px] text-[#ff5800]" strokeWidth={2} />
          <span
            className="font-['Roboto_Mono'] font-medium text-[#ff5800] text-[14px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            New Agent
          </span>
        </button>
      </div>

      {/* Hidden old components - Keep for later */}
      <div className="hidden">
        <MyAgentsHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          view={view}
          onViewChange={setView}
          onToggleCollapse={onToggleCollapse}
        />
        <CategoryTabs
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
        <FilterBar
          sortBy={sortBy}
          onSortChange={setSortBy}
          filters={filters}
          onToggleFilter={toggleFilter}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
        />
      </div>

      {showEmptyState ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-[#FF5800]/20 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-[#FF5800]" />
            </div>
            <h3
              className="font-['Roboto_Mono'] font-medium text-white text-[20px] leading-normal"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              No Agents Yet
            </h3>
            <p
              className="font-['Roboto_Flex'] font-normal text-[#858585] text-[16px] leading-normal"
              style={{ fontFamily: "'Roboto Flex', sans-serif" }}
            >
              Get started by creating your first AI agent. Build custom
              personalities and behaviors tailored to your needs.
            </p>
            <button
              onClick={handleCreateNew}
              className="relative bg-[rgba(255,88,0,0.25)] flex gap-[6px] items-center px-[16px] py-[10px] mx-auto group hover:bg-[rgba(255,88,0,0.3)] transition-colors mt-6"
            >
              {/* Corner Brackets */}
              <div className="absolute top-0 left-0 w-2 h-2 pointer-events-none">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M8 0L0 0L0 8" stroke="#FF5800" strokeWidth="1" />
                </svg>
              </div>
              <div className="absolute top-0 right-0 w-2 h-2 pointer-events-none">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M0 0L8 0L8 8" stroke="#FF5800" strokeWidth="1" />
                </svg>
              </div>
              <div className="absolute bottom-0 left-0 w-2 h-2 pointer-events-none">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M8 8L0 8L0 0" stroke="#FF5800" strokeWidth="1" />
                </svg>
              </div>
              <div className="absolute bottom-0 right-0 w-2 h-2 pointer-events-none">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M0 8L8 8L8 0" stroke="#FF5800" strokeWidth="1" />
                </svg>
              </div>

              <Plus
                className="w-[18px] h-[18px] text-[#ff5800]"
                strokeWidth={2}
              />
              <span
                className="font-['Roboto_Mono'] font-medium text-[#ff5800] text-[14px] leading-normal"
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                Create Your First Agent
              </span>
            </button>
          </div>
        </div>
      ) : (
        <CharacterGrid
          characters={displayCharacters}
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
      )}

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
