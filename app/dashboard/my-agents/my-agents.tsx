"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CharacterLibraryGrid } from "@/components/my-agents/character-library-grid";
import { CharacterFilters } from "@/components/my-agents/character-filters";
import { BrandButton } from "@/components/brand";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import type { ElizaCharacter } from "@/lib/types";

type ViewMode = "grid" | "list";
type SortOption = "name" | "created" | "modified" | "recent";

/**
 * My Agents client component that handles character listing, filtering, and management.
 * Fetches characters client-side to enable real-time updates.
 */
export function MyAgentsClient() {
  const router = useRouter();
  const claimAttempted = useRef(false);
  const [characters, setCharacters] = useState<ElizaCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("modified");

  // Fetch characters
  const fetchCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/my-agents/characters");
      if (!response.ok) throw new Error("Failed to fetch characters");
      const result = await response.json();
      setCharacters(result.data?.characters || []);
    } catch (error) {
      logger.error("[MyAgents] Failed to fetch characters:", error);
      toast.error("Failed to load your agents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and listen for updates
  useEffect(() => {
    fetchCharacters();

    // Listen for character updates
    const handleUpdate = () => fetchCharacters();
    window.addEventListener("characters-updated", handleUpdate);
    return () => window.removeEventListener("characters-updated", handleUpdate);
  }, [fetchCharacters]);

  // Claim any affiliate characters the user has interacted with
  useEffect(() => {
    if (claimAttempted.current) return;
    claimAttempted.current = true;

    const sessionToken = localStorage.getItem("eliza-anon-session-token");

    fetch("/api/my-agents/claim-affiliate-characters", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: sessionToken || undefined }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.claimed?.length > 0) {
          toast.success(
            `${data.claimed.length} agent(s) added to your library!`,
            {
              description: data.claimed
                .map((c: { name: string }) => c.name)
                .join(", "),
            },
          );
          fetchCharacters();

          if (sessionToken) {
            try {
              localStorage.removeItem("eliza-anon-session-token");
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      })
      .catch((error) => {
        logger.error("[MyAgents] Failed to claim affiliate characters:", error);
      });
  }, [fetchCharacters]);

  // Filter characters based on search
  const filteredCharacters = characters.filter((char) => {
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
      default:
        return 0;
    }
  });

  const handleCreateNew = useCallback(() => {
    router.push("/dashboard/build");
  }, [router]);

  useSetPageHeader({
    title: "My Agents",
    description: `Manage your ${characters.length} AI agent${characters.length !== 1 ? "s" : ""}`,
    actions: (
      <BrandButton onClick={handleCreateNew}>
        <Plus className="h-4 w-4 mr-2" />
        Create New Agent
      </BrandButton>
    ),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <CharacterFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortBy={sortBy}
        onSortChange={setSortBy}
        totalCount={characters.length}
        filteredCount={filteredCharacters.length}
      />

      <CharacterLibraryGrid
        characters={sortedCharacters}
        viewMode={viewMode}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}
