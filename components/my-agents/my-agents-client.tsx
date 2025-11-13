"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CharacterLibraryGrid } from "./character-library-grid";
import { CharacterFilters } from "./character-filters";
import { BrandButton } from "@/components/brand";
import { Plus } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";

interface MyAgentsClientProps {
  initialCharacters: ElizaCharacter[];
}

export type ViewMode = "grid" | "list";
export type SortOption = "name" | "created" | "modified" | "recent";

export function MyAgentsClient({ initialCharacters }: MyAgentsClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("modified");

  // Filter characters based on search
  const filteredCharacters = initialCharacters.filter((char) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      char.name?.toLowerCase().includes(query) ||
      (typeof char.bio === "string" &&
        char.bio.toLowerCase().includes(query)) ||
      (Array.isArray(char.bio) &&
        char.bio.some((b) => b.toLowerCase().includes(query))) ||
      char.topics?.some((t) => t.toLowerCase().includes(query)) ||
      char.adjectives?.some((a) => a.toLowerCase().includes(query))
    );
  });

  // Sort characters
  const sortedCharacters = [...filteredCharacters].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (a.name || "").localeCompare(b.name || "");
      case "created":
        // Note: created_at is not in ElizaCharacter type, using name as fallback
        return (a.name || "").localeCompare(b.name || "");
      case "modified":
        // Note: updated_at is not in ElizaCharacter type, using name as fallback
        return (b.name || "").localeCompare(a.name || "");
      case "recent":
        return (b.name || "").localeCompare(a.name || "");
      default:
        return 0;
    }
  });

  const handleCreateNew = useCallback(() => {
    router.push("/dashboard/character-creator");
  }, [router]);

  useSetPageHeader(
    {
      title: "My Agents",
      description: `Manage your ${initialCharacters.length} AI agent${initialCharacters.length !== 1 ? "s" : ""}`,
      actions: (
        <BrandButton onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create New Agent
        </BrandButton>
      ),
    },
    [initialCharacters.length, handleCreateNew]
  );

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


      </div>

      {/* Hidden Filters - Keep for later */}
      <div className="hidden">
        <CharacterFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalCount={initialCharacters.length}
          filteredCount={filteredCharacters.length}
        />
      </div>

      <CharacterLibraryGrid
        characters={sortedCharacters}
        viewMode={viewMode}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}
