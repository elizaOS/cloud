/**
 * Marketplace Configuration
 * Centralized configuration for marketplace features
 */

export const MARKETPLACE_CONFIG = {
  /**
   * Popularity scoring weights
   * These weights determine how different factors contribute to a character's popularity score
   */
  popularityScoring: {
    viewWeight: 0.3, // Weight for view count (30%)
    interactionWeight: 0.5, // Weight for interaction count (50%)
    recencyWeight: 0.2, // Weight for recency score (20%)
  },

  /**
   * Cache configuration
   */
  cache: {
    defaultTTL: 300, // 5 minutes
    categoryTTL: 600, // 10 minutes
    publicSearchTTL: 1800, // 30 minutes
  },

  /**
   * Pagination defaults
   */
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  /**
   * Infinite scroll configuration
   */
  infiniteScroll: {
    maxCachedCharacters: 200, // Maximum characters to keep in memory
  },
} as const;
