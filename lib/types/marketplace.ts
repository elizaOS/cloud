/**
 * Marketplace type definitions.
 */

// Re-export shared character types
export type {
  CategoryId,
  SortBy,
  SortOrder,
  CharacterSource,
  CharacterStats,
  ExtendedCharacter,
  SearchFilters,
  SortOptions,
  PaginationOptions,
  PaginationResult,
  CategoryInfo,
  CloneCharacterOptions,
  TrackingResponse,
} from "./characters";

/**
 * Result of a marketplace search query.
 */
export interface MarketplaceSearchResult {
  characters: ExtendedCharacter[];
  pagination: PaginationResult;
  filters: {
    appliedFilters: SearchFilters;
    availableCategories: CategoryInfo[];
  };
  cached: boolean;
}

/**
 * State for marketplace UI component.
 */
export interface MarketplaceState {
  characters: ExtendedCharacter[];
  filteredCharacters: ExtendedCharacter[];
  selectedCharacter: ExtendedCharacter | null;
  view: "grid" | "list";
  activeCategory: CategoryId | null;
  searchQuery: string;
  sortBy: SortBy;
  filters: SearchFilters;
  isLoading: boolean;
  isLoadingStats: boolean;
}
