/**
 * Hook for infinite scrolling character loading with caching and deduplication.
 * Supports filtering, sorting, and pagination with automatic cache management.
 *
 * @param options - Infinite characters hook options
 * @param options.filters - Search filters to apply
 * @param options.sortBy - Sort option
 * @param options.includeStats - Whether to include character statistics
 * @returns {object} Character data, loading states, and pagination controls
 */
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  ExtendedCharacter,
  SearchFilters,
  SortBy,
  MyAgentsSearchResult,
} from "@/lib/types/my-agents";

interface UseInfiniteCharactersOptions {
  filters: SearchFilters;
  sortBy: SortBy;
  includeStats?: boolean;
}

interface FetchState {
  characters: ExtendedCharacter[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  total: number;
  error: string | null;
}

const LIMIT = 20;
const MAX_CACHED = 200;

export function useInfiniteCharacters({
  filters,
  sortBy,
  includeStats = false,
}: UseInfiniteCharactersOptions) {
  const [state, setState] = useState<FetchState>({
    characters: [],
    isLoading: true,
    isLoadingMore: false,
    hasMore: true,
    total: 0,
    error: null,
  });
  const [page, setPage] = useState(1);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize the filter key to avoid unnecessary re-fetches
  const filterKey = useMemo(() => {
    return JSON.stringify({
      search: filters.search || "",
      category: filters.category || "",
      hasVoice: !!filters.hasVoice,
      deployed: !!filters.deployed,
      sortBy,
      includeStats,
    });
  }, [
    filters.search,
    filters.category,
    filters.hasVoice,
    filters.deployed,
    sortBy,
    includeStats,
  ]);

  const buildQueryParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: LIMIT.toString(),
        sortBy,
        order: "desc",
        includeStats: includeStats.toString(),
      });

      if (filters.search) params.set("search", filters.search);
      if (filters.category) params.set("category", filters.category);
      if (filters.hasVoice) params.set("hasVoice", "true");
      if (filters.deployed) params.set("deployed", "true");

      return params.toString();
    },
    [
      filters.search,
      filters.category,
      filters.hasVoice,
      filters.deployed,
      sortBy,
      includeStats,
    ],
  );

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setState((prev) => ({
        ...prev,
        isLoading: !append,
        isLoadingMore: append,
        error: append ? prev.error : null,
      }));

      // Check if request was aborted before proceeding
      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      try {
        const queryString = buildQueryParams(pageNum);
        const response = await fetch(
          `/api/my-agents/characters?${queryString}`,
          {
            signal: abortControllerRef.current.signal,
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch characters");
        }

        const json = await response.json();

        if (!json.success) {
          throw new Error(json.error || "API returned unsuccessful response");
        }

        const result: MyAgentsSearchResult = json.data;

        setState((prev) => {
          let newCharacters: ExtendedCharacter[];
          if (append) {
            newCharacters = [...prev.characters, ...result.characters];
            // Enforce max cache size
            if (newCharacters.length > MAX_CACHED) {
              newCharacters = newCharacters.slice(-MAX_CACHED);
            }
          } else {
            newCharacters = result.characters;
          }

          return {
            characters: newCharacters,
            isLoading: false,
            isLoadingMore: false,
            hasMore: result.pagination.hasMore,
            total: result.pagination.total,
            error: null,
          };
        });
      } catch (error) {
        // Don't set error state if request was aborted
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isLoadingMore: false,
          error: error instanceof Error ? error.message : "Failed to fetch characters",
        }));
      }
    },
    [buildQueryParams],
  );

  // Initial fetch and filter change handling
  useEffect(() => {
    // Use queueMicrotask to defer execution and avoid synchronous setState
    queueMicrotask(() => {
      setPage(1);
      fetchPage(1, false);
    });
  }, [filterKey, fetchPage]);  

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Listen for external events that should trigger a refresh (e.g., affiliate character claims)
  useEffect(() => {
    const handleCharactersUpdated = () => {
      setPage(1);
      fetchPage(1, false);
    };

    window.addEventListener("characters-updated", handleCharactersUpdated);
    return () => {
      window.removeEventListener("characters-updated", handleCharactersUpdated);
    };
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (state.isLoadingMore || state.isLoading || !state.hasMore) {
      return;
    }
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  }, [page, state.isLoadingMore, state.isLoading, state.hasMore, fetchPage]);

  const refetch = useCallback(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  return {
    characters: state.characters,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    total: state.total,
    error: state.error,
    loadMore,
    refetch,
  };
}
