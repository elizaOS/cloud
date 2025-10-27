import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ExtendedCharacter,
  SearchFilters,
  SortBy,
  MarketplaceSearchResult,
} from "@/lib/types/marketplace";
import { logger } from "@/lib/utils/logger";

interface UseInfiniteCharactersOptions {
  filters: SearchFilters;
  sortBy: SortBy;
  includeStats?: boolean;
}

export function useInfiniteCharacters({
  filters,
  sortBy,
  includeStats = true,
}: UseInfiniteCharactersOptions) {
  const [characters, setCharacters] = useState<ExtendedCharacter[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevFiltersRef = useRef<string>("");

  const fetchCharacters = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: "20",
          sortBy,
          order: "desc",
          includeStats: includeStats.toString(),
        });

        if (filters.search) params.set("search", filters.search);
        if (filters.category) params.set("category", filters.category);
        if (filters.hasVoice) params.set("hasVoice", "true");
        if (filters.deployed) params.set("deployed", "true");
        if (filters.template) params.set("template", "true");
        if (filters.myCharacters) params.set("myCharacters", "true");
        if (filters.public) params.set("public", "true");
        if (filters.featured) params.set("featured", "true");

        const response = await fetch(
          `/api/marketplace/characters?${params.toString()}`,
          { signal: abortControllerRef.current.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch characters");
        }

        const data: { success: boolean; data: MarketplaceSearchResult } =
          await response.json();

        if (data.success) {
          const result = data.data;

          if (append) {
            setCharacters((prev) => [...prev, ...result.characters]);
          } else {
            setCharacters(result.characters);
          }

          setHasMore(result.pagination.hasMore);
          setTotal(result.pagination.total);
          setError(null);
        } else {
          throw new Error("API returned unsuccessful response");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch characters";
        logger.error("[useInfiniteCharacters] Error fetching:", err);
        setError(errorMessage);

        if (!append) {
          setCharacters([]);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [sortBy, includeStats]
  );

  useEffect(() => {
    const filtersString = JSON.stringify({
      ...filters,
      sortBy,
      includeStats,
    });

    if (filtersString !== prevFiltersRef.current) {
      prevFiltersRef.current = filtersString;
      setPage(1);
      fetchCharacters(1, false);
    }
  }, [filters, sortBy, includeStats, fetchCharacters]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchCharacters(nextPage, true);
    }
  }, [page, isLoadingMore, isLoading, hasMore, fetchCharacters]);

  const refetch = useCallback(() => {
    setPage(1);
    setError(null);
    fetchCharacters(1, false);
  }, [fetchCharacters]);

  return {
    characters,
    isLoading,
    isLoadingMore,
    hasMore,
    total,
    error,
    loadMore,
    refetch,
  };
}
