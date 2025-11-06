import type { ElizaCharacter } from "@/lib/types";

export type CategoryId =
  | "assistant"
  | "anime"
  | "creative"
  | "gaming"
  | "learning"
  | "entertainment"
  | "history"
  | "lifestyle";

export type SortBy = "popularity" | "newest" | "name" | "updated";

export type SortOrder = "asc" | "desc";

export interface CharacterStats {
  messageCount: number;
  roomCount: number;
  lastActiveAt: Date | null;
  deploymentStatus: "deployed" | "draft" | "stopped";
  uptime?: number;
}

export interface ExtendedCharacter extends ElizaCharacter {
  id: string;
  isTemplate: boolean;
  isPublic: boolean;
  creatorName?: string;
  creatorId?: string;
  avatarUrl?: string;
  category?: CategoryId;
  tags?: string[];
  featured?: boolean;
  popularity?: number;
  viewCount?: number;
  interactionCount?: number;
  stats?: CharacterStats;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SearchFilters {
  search?: string;
  category?: CategoryId;
  hasVoice?: boolean;
  deployed?: boolean;
  template?: boolean;
  myCharacters?: boolean;
  public?: boolean;
  featured?: boolean;
}

export interface SortOptions {
  sortBy: SortBy;
  order: SortOrder;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface MyAgentsSearchResult {
  characters: ExtendedCharacter[];
  pagination: PaginationResult;
  filters: {
    appliedFilters: SearchFilters;
    availableCategories: CategoryInfo[];
  };
  cached: boolean;
}

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  color: string;
  characterCount: number;
  featured: boolean;
}

export interface MyAgentsState {
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

export interface CloneCharacterOptions {
  name?: string;
  makePublic?: boolean;
}

export interface TrackingResponse {
  success: boolean;
  count: number;
}
