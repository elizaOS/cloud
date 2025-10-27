import { useState, useCallback, useMemo } from "react";
import type {
  SearchFilters,
  SortBy,
  CategoryId,
} from "@/lib/types/marketplace";

export function useMarketplaceFilters() {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("popularity");
  const [filters, setFilters] = useState<SearchFilters>({
    hasVoice: false,
    deployed: false,
    template: false,
    myCharacters: false,
    public: false,
    featured: false,
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
      template: false,
      myCharacters: false,
      public: false,
      featured: false,
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
