import { useState, useCallback, useMemo } from "react";
import type { SearchFilters, SortBy, CategoryId } from "@/lib/types/my-agents";

export function useMyAgentsFilters() {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("popularity");
  const [filters, setFilters] = useState<SearchFilters>({
    hasVoice: false,
    deployed: false,
  });

  const toggleFilter = useCallback((filterKey: keyof SearchFilters) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: !prev[filterKey],
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      hasVoice: false,
      deployed: false,
    });
    setActiveCategory(null);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      Object.values(filters).some((value) => value === true) ||
      activeCategory !== null
    );
  }, [filters, activeCategory]);

  return {
    activeCategory,
    setActiveCategory,
    sortBy,
    setSortBy,
    filters,
    toggleFilter,
    clearAllFilters,
    hasActiveFilters,
  };
}
