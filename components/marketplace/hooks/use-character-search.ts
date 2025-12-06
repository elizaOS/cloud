/**
 * Hook for character search with debouncing.
 * Provides search query state with automatic debouncing to reduce API calls.
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 500)
 * @returns {object} Search query state and clear function
 */
import { useState, useEffect, useCallback } from "react";

export function useCharacterSearch(debounceMs: number = 500) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, debounceMs]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    clearSearch,
  };
}
