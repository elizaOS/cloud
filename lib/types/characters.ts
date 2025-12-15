/**
 * Type definitions for character-related functionality.
 */

import type { ElizaCharacter } from "@/lib/types";

/**
 * Character category identifier.
 */
export type CategoryId =
  | "assistant"
  | "anime"
  | "creative"
  | "gaming"
  | "learning"
  | "entertainment"
  | "history"
  | "lifestyle";

/**
 * Sort field for character listings.
 */
export type SortBy = "popularity" | "newest" | "name" | "updated";

/**
 * Sort order direction.
 */
export type SortOrder = "asc" | "desc";

/**
 * Source of character creation.
 */
export type CharacterSource = "cloud" | "app";

/**
 * Statistics for a character.
 */
export interface CharacterStats {
  messageCount: number;
  roomCount: number;
  lastActiveAt: Date | null;
  deploymentStatus: "deployed" | "draft" | "stopped";
  uptime?: number;
}

/**
 * ERC-8004 registration status for a character.
 */
export interface ERC8004Status {
  registered: boolean;
  network?: string;
  agentId?: number;
  agentUri?: string;
  registeredAt?: Date;
}

/**
 * Protocol support status.
 */
export interface ProtocolStatus {
  a2aEnabled: boolean;
  mcpEnabled: boolean;
}

/**
 * Monetization settings.
 */
export interface MonetizationSettings {
  enabled: boolean;
  markupPercentage: number;
}

/**
 * Extended character with marketplace and display metadata.
 */
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
  /** ERC-8004 on-chain registration status */
  erc8004?: ERC8004Status;
  /** Protocol endpoints enabled */
  protocols?: ProtocolStatus;
  /** Monetization settings */
  monetization?: MonetizationSettings;
}

/**
 * Filters for character search.
 */
export interface SearchFilters {
  search?: string;
  category?: CategoryId;
  hasVoice?: boolean;
  deployed?: boolean;
  template?: boolean;
  myCharacters?: boolean;
  public?: boolean;
  featured?: boolean;
  source?: CharacterSource; // Filter by where character was created
}

/**
 * Sort options for character listings.
 */
export interface SortOptions {
  sortBy: SortBy;
  order: SortOrder;
}

/**
 * Pagination options for character listings.
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Pagination result with metadata.
 */
export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Category information with metadata.
 */
export interface CategoryInfo {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  color: string;
  characterCount: number;
  featured: boolean;
}

/**
 * Options for cloning a character.
 */
export interface CloneCharacterOptions {
  name?: string;
  makePublic?: boolean;
}

/**
 * Response from tracking operations (views, interactions).
 */
export interface TrackingResponse {
  success: boolean;
  count: number;
}

/**
 * Result of a character search query.
 * Used by both marketplace and my-agents views.
 */
export interface CharacterSearchResult {
  characters: ExtendedCharacter[];
  pagination: PaginationResult;
  filters: {
    appliedFilters: SearchFilters;
    availableCategories: CategoryInfo[];
  };
  cached: boolean;
}

/**
 * State for character list UI components.
 * Used by both marketplace and my-agents views.
 */
export interface CharacterListState {
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

/** @deprecated Use CharacterSearchResult instead */
export type MarketplaceSearchResult = CharacterSearchResult;

/** @deprecated Use CharacterSearchResult instead */
export type MyAgentsSearchResult = CharacterSearchResult;

/** @deprecated Use CharacterListState instead */
export type MarketplaceState = CharacterListState;

/** @deprecated Use CharacterListState instead */
export type MyAgentsState = CharacterListState;
