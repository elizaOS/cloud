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
