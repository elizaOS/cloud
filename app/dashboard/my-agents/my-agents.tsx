"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CharacterLibraryGrid } from "@/components/my-agents/character-library-grid";
import { CharacterFilters } from "@/components/my-agents/character-filters";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";

export type ViewMode = "grid" | "list";
export type SortOption = "name" | "created" | "modified" | "recent";

const PAGE_SIZE = 30;

interface MyAgentCharacter {
  id: string;
  name: string;
  bio: string | string[];
  avatarUrl?: string;
  avatar_url?: string;
  topics?: string[];
  adjectives?: string[];
  created_at?: string;
  updated_at?: string;
}

interface PaginationState {
  page: number;
  hasMore: boolean;
  totalCount: number;
}

// Map client sort options to API sort options
function getApiSortParams(sort: SortOption): { sortBy: string; order: string } {
  switch (sort) {
    case "name":
      return { sortBy: "name", order: "asc" };
    case "created":
      return { sortBy: "newest", order: "desc" };
    case "modified":
      return { sortBy: "updated", order: "desc" };
    default:
      return { sortBy: "updated", order: "desc" };
  }
}

/**
 * My Agents client component that handles character listing, filtering, and management.
 * Fetches characters client-side with infinite scroll pagination.
 */
export function MyAgentsClient() {
  const router = useRouter();
  const claimAttempted = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [characters, setCharacters] = useState<MyAgentCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("modified");
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    hasMore: false,
    totalCount: 0,
  });

  // Fetch characters with pagination
  const fetchCharacters = useCallback(
    async (page: number, sort: SortOption, append = false) => {
      const { sortBy: apiSortBy, order } = getApiSortParams(sort);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: apiSortBy,
        order,
      });

      const response = await fetch(`/api/my-agents/characters?${params}`);
      if (!response.ok) throw new Error("Failed to fetch characters");

      const result = await response.json();
      const newCharacters = result.data?.characters || [];
      const paginationData = result.data?.pagination;

      if (append) {
        setCharacters((prev) => [...prev, ...newCharacters]);
      } else {
        setCharacters(newCharacters);
      }

      setPagination({
        page: paginationData?.page || page,
        hasMore: paginationData?.hasMore || false,
        totalCount: paginationData?.totalCount || 0,
      });

      return { hasMore: paginationData?.hasMore || false };
    },
    [],
  );

  // Initial fetch and when sort changes
  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      setIsLoading(true);
      setCharacters([]);
      setPagination({ page: 1, hasMore: false, totalCount: 0 });

      try {
        await fetchCharacters(1, sortBy, false);
      } catch (error) {
        if (!cancelled) {
          logger.error("[MyAgents] Failed to fetch characters:", error);
          toast.error("Failed to load your agents");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [sortBy, fetchCharacters]);

  // Listen for character updates
  useEffect(() => {
    const handleUpdate = async () => {
      setCharacters([]);
      setPagination({ page: 1, hasMore: false, totalCount: 0 });
      try {
        await fetchCharacters(1, sortBy, false);
      } catch (error) {
        logger.error("[MyAgents] Failed to refresh characters:", error);
      }
    };

    window.addEventListener("characters-updated", handleUpdate);
    return () => window.removeEventListener("characters-updated", handleUpdate);
  }, [sortBy, fetchCharacters]);

  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !pagination.hasMore) return;

    setIsLoadingMore(true);
    try {
      await fetchCharacters(pagination.page + 1, sortBy, true);
    } catch (error) {
      logger.error("[MyAgents] Failed to load more characters:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination.page, pagination.hasMore, isLoadingMore, sortBy, fetchCharacters]);

  // Infinite scroll observer
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || isLoading || isLoadingMore || !pagination.hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoading, isLoadingMore, pagination.hasMore, loadMore]);

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
      .then(async (data) => {
        if (data.success && data.claimed?.length > 0) {
          toast.success(
            `${data.claimed.length} agent(s) added to your library!`,
            {
              description: data.claimed
                .map((c: { name: string }) => c.name)
                .join(", "),
            },
          );
          await fetchCharacters(1, sortBy, false);

          if (sessionToken) {
            localStorage.removeItem("eliza-anon-session-token");
          }
        }
      })
      .catch((error) => {
        logger.error("[MyAgents] Failed to claim affiliate characters:", error);
      });
  }, [sortBy, fetchCharacters]);

  // Filter characters based on search (client-side for instant feedback)
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

  const handleCreateNew = useCallback(() => {
    router.push("/dashboard/build");
  }, [router]);

  useSetPageHeader(
    {
      title: "My Agents",
      description: "Manage your AI agents",
    },
    [],
  );

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
        totalCount={pagination.totalCount}
        filteredCount={filteredCharacters.length}
        onCreateNew={handleCreateNew}
      />

      <CharacterLibraryGrid
        characters={filteredCharacters}
        viewMode={viewMode}
        onCreateNew={handleCreateNew}
      />

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-4" />

      {isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
