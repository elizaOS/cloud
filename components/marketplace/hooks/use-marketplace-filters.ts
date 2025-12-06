/**
 * Hook for managing marketplace filters and sorting state.
 * Provides filter toggles, category selection, and clear functionality.
 *
 * @returns {object} Filter state and control functions
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import type { SearchFilters, SortBy, CategoryId } from "@/lib/types/my-agents";

export function useMyAgentsFilters() {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [hasVoice, setHasVoice] = useState(false);
  const [deployed, setDeployed] = useState(false);

  const filters: SearchFilters = useMemo(
    () => ({
      hasVoice: hasVoice || undefined,
      deployed: deployed || undefined,
      category: activeCategory || undefined,
    }),
    [hasVoice, deployed, activeCategory]
  );

  const toggleFilter = useCallback((filterKey: keyof SearchFilters) => {
    if (filterKey === "hasVoice") {
      setHasVoice((prev) => !prev);
    } else if (filterKey === "deployed") {
      setDeployed((prev) => !prev);
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setHasVoice(false);
    setDeployed(false);
    setActiveCategory(null);
  }, []);

  const hasActiveFilters = hasVoice || deployed || activeCategory !== null;

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
