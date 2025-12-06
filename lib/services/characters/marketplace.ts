/**
 * Character Marketplace Service
 * 
 * Unified service for character marketplace operations.
 * This service handles BOTH public marketplace AND user's personal character library.
 * 
 * Domain: Characters (user_characters table)
 * - Public characters (templates, published characters)
 * - User's personal characters
 * - Character search, filtering, and statistics
 * 
 * Note: This does NOT deal with agents or deployments.
 * For deployment status, use characterDeploymentDiscoveryService.
 */

import {
  userCharactersRepository,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/repositories";
import { characterDeploymentDiscoveryService } from "../deployments/discovery";
import type { AgentStats } from "../deployments/discovery";
import { marketplaceCache } from "@/lib/cache/marketplace-cache";
import { logger } from "@/lib/utils/logger";
import {
  getAllCategories,
} from "@/lib/constants/character-categories";
import type {
  SearchFilters,
  SortOptions,
  PaginationOptions,
  MarketplaceSearchResult,
  ExtendedCharacter,
  CloneCharacterOptions,
  CategoryInfo,
  TrackingResponse,
} from "@/lib/types/marketplace";
import { MARKETPLACE_CONFIG } from "@/lib/config/marketplace";

export class CharacterMarketplaceService {
  /**
   * Search characters (both public and user's own characters)
   */
  async searchCharacters(options: {
    userId: string;
    organizationId: string;
    filters: SearchFilters;
    sortOptions: SortOptions;
    pagination: PaginationOptions;
    includeStats: boolean;
  }): Promise<MarketplaceSearchResult> {
    const {
      userId,
      organizationId,
      filters,
      sortOptions,
      pagination,
      includeStats,
    } = options;

    // Skip caching for user-specific queries to ensure fresh data
    const { deployed, ...dbFilters } = filters;

    logger.debug("[Character Marketplace] Searching characters:", {
      userId,
      filters: dbFilters,
      deployed,
    });

    const offset = (pagination.page - 1) * pagination.limit;

    // Fetch characters from database (without deployed filter - handled separately)
    const [characters, total] = await Promise.all([
      userCharactersRepository.search(
        dbFilters,
        userId,
        organizationId,
        sortOptions,
        // Fetch more if we need to filter by deployed status
        deployed !== undefined ? pagination.limit * 3 : pagination.limit,
        deployed !== undefined ? 0 : offset
      ),
      userCharactersRepository.count(dbFilters, userId, organizationId),
    ]);

    logger.debug(
      `[Character Marketplace] Found ${characters.length} characters (${total} total)`,
    );

    // Convert to extended characters
    let enrichedCharacters = characters.map((char) =>
      this.toExtendedCharacter(char)
    );

    // Fetch stats if needed (either for display or filtering by deployed)
    if (includeStats || deployed !== undefined) {
      // Batch fetch stats to avoid N+1 queries
      const characterIds = enrichedCharacters.map((char) => char.id);
      let statsMap: Map<string, AgentStats> = new Map();
      
      try {
        statsMap =
          await characterDeploymentDiscoveryService.getCharacterStatisticsBatch(
            characterIds,
          );
      } catch (error) {
        logger.warn(
          `[Character Marketplace] Failed to batch fetch stats:`,
          error,
        );
      }

      // Enrich with stats
      enrichedCharacters = enrichedCharacters.map((char) => {
        const stats = statsMap.get(char.id);
        if (stats) {
          return {
            ...char,
            stats: {
              messageCount: stats.messageCount,
              roomCount: stats.roomCount ?? 0,
              lastActiveAt: stats.lastActiveAt,
              deploymentStatus: stats.status,
              uptime: stats.uptime,
            },
          };
        }
        return {
          ...char,
          stats: {
            messageCount: 0,
            roomCount: 0,
            lastActiveAt: null,
            deploymentStatus: "draft" as const,
            uptime: 0,
          },
        };
      });
    }

    // Filter by deployment status if requested
    if (deployed !== undefined) {
      enrichedCharacters = enrichedCharacters.filter((char) => {
        const isDeployed = char.stats?.deploymentStatus === "deployed";
        return deployed ? isDeployed : !isDeployed;
      });
    }

    // Apply pagination after filtering (if we fetched extra for deployed filter)
    let paginatedCharacters = enrichedCharacters;
    let adjustedTotal = total;

    if (deployed !== undefined) {
      adjustedTotal = enrichedCharacters.length;
      paginatedCharacters = enrichedCharacters.slice(
        offset,
        offset + pagination.limit
      );
    }

    const result: MarketplaceSearchResult = {
      characters: paginatedCharacters,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: adjustedTotal,
        totalPages: Math.ceil(adjustedTotal / pagination.limit),
        hasMore: offset + paginatedCharacters.length < adjustedTotal,
      },
      filters: {
        appliedFilters: filters,
        availableCategories: await this.getCategories(organizationId, userId),
      },
      cached: false,
    };

    return result;
  }

  /**
   * Get available categories with character counts
   */
  async getCategories(
    organizationId: string,
    userId: string
  ): Promise<CategoryInfo[]> {
    const cached = await marketplaceCache.getCategories(organizationId);
    if (cached) {
      return cached;
    }

    const allCategories = getAllCategories();

    const categoriesWithCounts = await Promise.all(
      allCategories.map(async (category) => {
        try {
          const count = await userCharactersRepository.count(
            { category: category.id },
            userId,
            organizationId
          );

          return {
            id: category.id,
            name: category.name,
            description: category.description,
            icon: category.icon,
            color: category.color,
            characterCount: count,
            featured: false,
          };
        } catch (error) {
          logger.error(
            `[Character Marketplace] Error getting count for category ${category.id}:`,
            error,
          );
          return {
            id: category.id,
            name: category.name,
            description: category.description,
            icon: category.icon,
            color: category.color,
            characterCount: 0,
            featured: false,
          };
        }
      })
    );

    await marketplaceCache.setCategories(organizationId, categoriesWithCounts);

    return categoriesWithCounts;
  }

  /**
   * Get character by ID
   */
  async getCharacterById(
    characterId: string,
    includeStats: boolean = false
  ): Promise<ExtendedCharacter | null> {
    const cached = await marketplaceCache.getCharacter(characterId);
    if (cached && (!includeStats || cached.stats)) {
      return cached;
    }

    const character = await userCharactersRepository.findById(characterId);
    if (!character) {
      return null;
    }

    let extended = this.toExtendedCharacter(character);

    if (includeStats) {
      try {
        const stats =
          await characterDeploymentDiscoveryService.getCharacterStatistics(
            characterId,
          );
        extended = {
          ...extended,
          stats: {
            messageCount: stats.messageCount,
            roomCount: stats.roomCount ?? 0,
            lastActiveAt: stats.lastActiveAt,
            deploymentStatus: stats.status,
            uptime: stats.uptime,
          },
        };
      } catch (error) {
        logger.warn(
          `[Character Marketplace] Failed to get stats for ${characterId}:`,
          error,
        );
      }
    }

    await marketplaceCache.setCharacter(characterId, extended);

    return extended;
  }

  /**
   * Clone a character (create a copy for the user)
   */
  async cloneCharacter(
    characterId: string,
    userId: string,
    organizationId: string,
    options?: CloneCharacterOptions
  ): Promise<ExtendedCharacter> {
    logger.info(
      `[Character Marketplace] Cloning character ${characterId} for user ${userId}`,
    );

    const sourceCharacter =
      await userCharactersRepository.findById(characterId);

    if (!sourceCharacter) {
      throw new Error("Character not found");
    }

    if (!sourceCharacter.is_template && !sourceCharacter.is_public) {
      throw new Error("Character is not available for cloning");
    }

    const clonedData: NewUserCharacter = {
      organization_id: organizationId,
      user_id: userId,
      name: options?.name || `${sourceCharacter.name} (Copy)`,
      username: sourceCharacter.username,
      system: sourceCharacter.system,
      bio: sourceCharacter.bio,
      message_examples: sourceCharacter.message_examples,
      post_examples: sourceCharacter.post_examples,
      topics: sourceCharacter.topics,
      adjectives: sourceCharacter.adjectives,
      knowledge: sourceCharacter.knowledge,
      plugins: sourceCharacter.plugins,
      settings: sourceCharacter.settings,
      secrets: {},
      style: sourceCharacter.style,
      character_data: sourceCharacter.character_data,
      is_template: false,
      is_public: options?.makePublic || false,
      avatar_url: sourceCharacter.avatar_url,
      category: sourceCharacter.category,
      tags: sourceCharacter.tags,
      featured: false,
      view_count: 0,
      interaction_count: 0,
      popularity_score: 0,
      source: "cloud", // Cloned from cloud dashboard
    };

    const clonedCharacter = await userCharactersRepository.create(clonedData);

    await this.invalidateUserCache(userId, organizationId);

    logger.info(
      `[Character Marketplace] Successfully cloned character: ${clonedCharacter.id}`,
    );

    return this.toExtendedCharacter(clonedCharacter);
  }

  /**
   * Track character view (for analytics)
   */
  async trackView(characterId: string): Promise<TrackingResponse> {
    try {
      await userCharactersRepository.incrementViewCount(characterId);

      const character = await userCharactersRepository.findById(characterId);
      const viewCount = character?.view_count || 0;

      await marketplaceCache.invalidateCharacter(characterId);

      logger.debug(
        `[Character Marketplace] Tracked view for character: ${characterId}`,
      );

      return {
        success: true,
        count: viewCount,
      };
    } catch (error) {
      logger.error(
        `[Character Marketplace] Error tracking view for ${characterId}:`,
        error,
      );
      return {
        success: false,
        count: 0,
      };
    }
  }

  /**
   * Track character interaction (for analytics)
   */
  async trackInteraction(characterId: string): Promise<TrackingResponse> {
    try {
      await userCharactersRepository.incrementInteractionCount(characterId);

      await this.updatePopularityScore(characterId);

      const character = await userCharactersRepository.findById(characterId);
      const interactionCount = character?.interaction_count || 0;

      await marketplaceCache.invalidateCharacter(characterId);

      logger.debug(
        `[Character Marketplace] Tracked interaction for character: ${characterId}`,
      );

      return {
        success: true,
        count: interactionCount,
      };
    } catch (error) {
      logger.error(
        `[Character Marketplace] Error tracking interaction for ${characterId}:`,
        error,
      );
      return {
        success: false,
        count: 0,
      };
    }
  }

  /**
   * Update popularity score based on views, interactions, and recency
   */
  private async updatePopularityScore(characterId: string): Promise<void> {
    const character = await userCharactersRepository.findById(characterId);
    if (!character) return;

    const { viewWeight, interactionWeight, recencyWeight } =
      MARKETPLACE_CONFIG.popularityScoring;

    const viewScore = (character.view_count || 0) * viewWeight;
    const interactionScore =
      (character.interaction_count || 0) * interactionWeight;
    const recencyScore =
      this.calculateRecencyScore(character.updated_at) * recencyWeight;

    const popularityScore = Math.round(
      viewScore + interactionScore + recencyScore
    );

    await userCharactersRepository.updatePopularityScore(
      characterId,
      popularityScore
    );

    logger.debug(
      `[Character Marketplace] Updated popularity score for ${characterId}: ${popularityScore}`,
    );
  }

  /**
   * Calculate recency score (exponential decay)
   */
  private calculateRecencyScore(updatedAt: Date): number {
    const daysSinceUpdate =
      (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    return Math.max(0, 1000 * Math.exp(-daysSinceUpdate / 30));
  }

  /**
   * Get featured characters
   */
  async getFeaturedCharacters(
    limit: number = 10,
    includeStats: boolean = false
  ): Promise<ExtendedCharacter[]> {
    const featured = await userCharactersRepository.getFeatured(limit);

    let extendedCharacters = featured.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      const ids = extendedCharacters.map((c) => c.id);
      const statsMap =
        await characterDeploymentDiscoveryService.getCharacterStatisticsBatch(ids);

      extendedCharacters = extendedCharacters.map((char) => {
        const stats = statsMap.get(char.id);
        if (stats) {
          return {
            ...char,
            stats: {
              messageCount: stats.messageCount,
              roomCount: stats.roomCount ?? 0,
              lastActiveAt: stats.lastActiveAt,
              deploymentStatus: stats.status,
              uptime: stats.uptime,
            },
          };
        }
        return char;
      });
    }

    return extendedCharacters;
  }

  /**
   * Get popular characters
   */
  async getPopularCharacters(
    limit: number = 20,
    includeStats: boolean = false
  ): Promise<ExtendedCharacter[]> {
    const popular = await userCharactersRepository.getPopular(limit);

    let extendedCharacters = popular.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      const ids = extendedCharacters.map((c) => c.id);
      const statsMap =
        await characterDeploymentDiscoveryService.getCharacterStatisticsBatch(ids);

      extendedCharacters = extendedCharacters.map((char) => {
        const stats = statsMap.get(char.id);
        if (stats) {
          return {
            ...char,
            stats: {
              messageCount: stats.messageCount,
              roomCount: stats.roomCount ?? 0,
              lastActiveAt: stats.lastActiveAt,
              deploymentStatus: stats.status,
              uptime: stats.uptime,
            },
          };
        }
        return char;
      });
    }

    return extendedCharacters;
  }

  /**
   * Search public characters (no authentication required)
   */
  async searchCharactersPublic(options: {
    filters: Omit<SearchFilters, "myCharacters" | "deployed">;
    sortOptions: SortOptions;
    pagination: PaginationOptions;
    includeStats: boolean;
  }): Promise<MarketplaceSearchResult> {
    const { filters, sortOptions, pagination, includeStats } = options;

    const organizationId = "public";

    const cacheKey = marketplaceCache.createFilterHash({
      ...filters,
      ...sortOptions,
      ...pagination,
      includeStats,
      mode: "public",
    });

    const cached = await marketplaceCache.getSearchResult(
      organizationId,
      cacheKey
    );
    if (cached) {
      logger.debug("[Character Marketplace] Public cache hit");
      return { ...cached, cached: true };
    }

    logger.debug("[Character Marketplace] Public search:", filters);

    const offset = (pagination.page - 1) * pagination.limit;

    const [characters, total] = await Promise.all([
      userCharactersRepository.searchPublic(
        filters,
        sortOptions,
        pagination.limit,
        offset
      ),
      userCharactersRepository.countPublic(filters),
    ]);

    logger.debug(
      `[Character Marketplace] Found ${characters.length} public characters (${total} total)`,
    );

    let enrichedCharacters = characters.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      const ids = enrichedCharacters.map((c) => c.id);
      const statsMap =
        await characterDeploymentDiscoveryService.getCharacterStatisticsBatch(ids);

      enrichedCharacters = enrichedCharacters.map((char) => {
        const stats = statsMap.get(char.id);
        if (stats) {
          return {
            ...char,
            stats: {
              messageCount: stats.messageCount,
              roomCount: stats.roomCount ?? 0,
              lastActiveAt: stats.lastActiveAt,
              deploymentStatus: stats.status,
              uptime: stats.uptime,
            },
          };
        }
        return char;
      });
    }

    const result: MarketplaceSearchResult = {
      characters: enrichedCharacters,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
        hasMore: offset + characters.length < total,
      },
      filters: {
        appliedFilters: filters as SearchFilters,
        availableCategories: await this.getCategoriesPublic(),
      },
      cached: false,
    };

    await marketplaceCache.setSearchResult(
      organizationId,
      cacheKey,
      result,
      30 * 60
    );

    return result;
  }

  /**
   * Get public categories
   */
  async getCategoriesPublic(): Promise<CategoryInfo[]> {
    const organizationId = "public";
    const cached = await marketplaceCache.getCategories(organizationId);
    if (cached) {
      return cached;
    }

    const allCategories = getAllCategories();

    const categoriesWithCounts = await Promise.all(
      allCategories.map(async (category) => {
        try {
          const count = await userCharactersRepository.countPublic({
            category: category.id,
          });

          return {
            id: category.id,
            name: category.name,
            description: category.description,
            icon: category.icon,
            color: category.color,
            characterCount: count,
            featured: false,
          };
        } catch (error) {
          logger.error(
            `[Character Marketplace] Error getting count for category ${category.id}:`,
            error,
          );
          return {
            id: category.id,
            name: category.name,
            description: category.description,
            icon: category.icon,
            color: category.color,
            characterCount: 0,
            featured: false,
          };
        }
      })
    );

    const nonEmptyCategories = categoriesWithCounts.filter(
      (cat) => cat.characterCount > 0
    );

    await marketplaceCache.setCategories(
      organizationId,
      nonEmptyCategories,
      60 * 60
    );

    return nonEmptyCategories;
  }

  /**
   * Convert database character to ExtendedCharacter format
   */
  private toExtendedCharacter(character: UserCharacter): ExtendedCharacter {
    return {
      id: character.id,
      name: character.name,
      username: character.username || undefined,
      system: character.system || undefined,
      bio: character.bio,
      messageExamples: character.message_examples as ExtendedCharacter["messageExamples"],
      postExamples: character.post_examples as string[] | undefined,
      topics: character.topics as string[] | undefined,
      adjectives: character.adjectives as string[] | undefined,
      knowledge: character.knowledge as ExtendedCharacter["knowledge"],
      plugins: character.plugins as string[] | undefined,
      settings: character.settings as ExtendedCharacter["settings"],
      secrets: character.secrets as ExtendedCharacter["secrets"],
      style: character.style as ExtendedCharacter["style"],
      isTemplate: character.is_template,
      isPublic: character.is_public,
      creatorId: character.user_id,
      avatarUrl: character.avatar_url || undefined,
      category: character.category as ExtendedCharacter["category"],
      tags: (character.tags as string[]) || undefined,
      featured: character.featured,
      popularity: character.popularity_score,
      viewCount: character.view_count,
      interactionCount: character.interaction_count,
      createdAt: character.created_at,
      updatedAt: character.updated_at,
    };
  }

  /**
   * Invalidate caches for a user
   */
  private async invalidateUserCache(
    userId: string,
    organizationId: string
  ): Promise<void> {
    await Promise.all([
      marketplaceCache.invalidateSearchResults(organizationId),
      marketplaceCache.invalidateCategories(organizationId),
      characterDeploymentDiscoveryService.invalidateCharacterListCache(
        organizationId,
      ),
    ]);

    logger.debug(
      `[Character Marketplace] Invalidated caches for user: ${userId}`,
    );
  }
}

// Export singleton instance
export const characterMarketplaceService = new CharacterMarketplaceService();

// Backward compatibility exports
/** @deprecated Use characterMarketplaceService instead */
export const marketplaceService = characterMarketplaceService;
/** @deprecated Use characterMarketplaceService instead */
export const myAgentsService = characterMarketplaceService;
