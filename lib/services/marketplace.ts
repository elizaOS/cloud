import {
  userCharactersRepository,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/repositories";
import { agentDiscoveryService, type AgentStats } from "./agent-discovery";
import { marketplaceCache } from "@/lib/cache/marketplace-cache";
import { logger } from "@/lib/utils/logger";
import {
  getAllCategories,
  getCategoryById,
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

export class MarketplaceService {
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

    const cacheKey = marketplaceCache.createFilterHash({
      ...filters,
      ...sortOptions,
      ...pagination,
      includeStats,
    });

    const cached = await marketplaceCache.getSearchResult(
      organizationId,
      cacheKey
    );
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.debug(
      `[Marketplace Service] Searching characters with filters:`,
      filters
    );

    const offset = (pagination.page - 1) * pagination.limit;

    const [characters, total] = await Promise.all([
      userCharactersRepository.search(
        filters,
        userId,
        organizationId,
        sortOptions,
        pagination.limit,
        offset
      ),
      userCharactersRepository.count(filters, userId, organizationId),
    ]);

    logger.debug(
      `[Marketplace Service] Found ${characters.length} characters (${total} total)`
    );

    let enrichedCharacters = characters.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      // Batch fetch stats to avoid N+1 queries
      const characterIds = enrichedCharacters.map((char) => char.id);
      let statsMap: Map<string, AgentStats>;
      try {
        statsMap =
          await agentDiscoveryService.getAgentStatisticsBatch(characterIds);
      } catch (error) {
        logger.warn(
          `[Marketplace Service] Failed to batch fetch stats:`,
          error
        );
        statsMap = new Map();
      }

      enrichedCharacters = enrichedCharacters.map((char) => {
        const stats = statsMap.get(char.id);
        if (stats) {
          return {
            ...char,
            stats: {
              messageCount: stats.messageCount,
              roomCount: 0,
              lastActiveAt: stats.lastActiveAt,
              deploymentStatus: stats.status,
              uptime: stats.uptime,
            },
          };
        } else {
          return char;
        }
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
        appliedFilters: filters,
        availableCategories: await this.getCategories(organizationId),
      },
      cached: false,
    };

    await marketplaceCache.setSearchResult(organizationId, cacheKey, result);

    return result;
  }

  async getCategories(organizationId: string): Promise<CategoryInfo[]> {
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
            "",
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
            `[Marketplace Service] Error getting count for category ${category.id}:`,
            error
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
          await agentDiscoveryService.getAgentStatistics(characterId);
        extended = {
          ...extended,
          stats: {
            messageCount: stats.messageCount,
            roomCount: 0,
            lastActiveAt: stats.lastActiveAt,
            deploymentStatus: stats.status,
            uptime: stats.uptime,
          },
        };
      } catch (error) {
        logger.warn(
          `[Marketplace Service] Failed to get stats for ${characterId}:`,
          error
        );
      }
    }

    await marketplaceCache.setCharacter(characterId, extended);

    return extended;
  }

  async cloneCharacter(
    characterId: string,
    userId: string,
    organizationId: string,
    options?: CloneCharacterOptions
  ): Promise<ExtendedCharacter> {
    logger.info(
      `[Marketplace Service] Cloning character ${characterId} for user ${userId}`
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
    };

    const clonedCharacter = await userCharactersRepository.create(clonedData);

    await this.invalidateUserCache(userId, organizationId);

    logger.info(
      `[Marketplace Service] Successfully cloned character: ${clonedCharacter.id}`
    );

    return this.toExtendedCharacter(clonedCharacter);
  }

  async trackView(characterId: string): Promise<TrackingResponse> {
    try {
      await userCharactersRepository.incrementViewCount(characterId);

      const character = await userCharactersRepository.findById(characterId);
      const viewCount = character?.view_count || 0;

      await marketplaceCache.invalidateCharacter(characterId);

      logger.debug(
        `[Marketplace Service] Tracked view for character: ${characterId}`
      );

      return {
        success: true,
        count: viewCount,
      };
    } catch (error) {
      logger.error(
        `[Marketplace Service] Error tracking view for ${characterId}:`,
        error
      );
      return {
        success: false,
        count: 0,
      };
    }
  }

  async trackInteraction(characterId: string): Promise<TrackingResponse> {
    try {
      await userCharactersRepository.incrementInteractionCount(characterId);

      await this.updatePopularityScore(characterId);

      const character = await userCharactersRepository.findById(characterId);
      const interactionCount = character?.interaction_count || 0;

      await marketplaceCache.invalidateCharacter(characterId);

      logger.debug(
        `[Marketplace Service] Tracked interaction for character: ${characterId}`
      );

      return {
        success: true,
        count: interactionCount,
      };
    } catch (error) {
      logger.error(
        `[Marketplace Service] Error tracking interaction for ${characterId}:`,
        error
      );
      return {
        success: false,
        count: 0,
      };
    }
  }

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
      `[Marketplace Service] Updated popularity score for ${characterId}: ${popularityScore}`
    );
  }

  private calculateRecencyScore(updatedAt: Date): number {
    const daysSinceUpdate =
      (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    return Math.max(0, 1000 * Math.exp(-daysSinceUpdate / 30));
  }

  async getFeaturedCharacters(
    limit: number = 10,
    includeStats: boolean = false
  ): Promise<ExtendedCharacter[]> {
    const featured = await userCharactersRepository.getFeatured(limit);

    let extendedCharacters = featured.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      extendedCharacters = await Promise.all(
        extendedCharacters.map(async (char) => {
          try {
            const stats = await agentDiscoveryService.getAgentStatistics(
              char.id
            );
            return {
              ...char,
              stats: {
                messageCount: stats.messageCount,
                roomCount: 0,
                lastActiveAt: stats.lastActiveAt,
                deploymentStatus: stats.status,
                uptime: stats.uptime,
              },
            };
          } catch (error) {
            return char;
          }
        })
      );
    }

    return extendedCharacters;
  }

  async getPopularCharacters(
    limit: number = 20,
    includeStats: boolean = false
  ): Promise<ExtendedCharacter[]> {
    const popular = await userCharactersRepository.getPopular(limit);

    let extendedCharacters = popular.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      extendedCharacters = await Promise.all(
        extendedCharacters.map(async (char) => {
          try {
            const stats = await agentDiscoveryService.getAgentStatistics(
              char.id
            );
            return {
              ...char,
              stats: {
                messageCount: stats.messageCount,
                roomCount: 0,
                lastActiveAt: stats.lastActiveAt,
                deploymentStatus: stats.status,
                uptime: stats.uptime,
              },
            };
          } catch (error) {
            return char;
          }
        })
      );
    }

    return extendedCharacters;
  }

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
      logger.debug("[Marketplace Service] Public cache hit");
      return { ...cached, cached: true };
    }

    logger.debug("[Marketplace Service] Public search:", filters);

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
      `[Marketplace Service] Found ${characters.length} public characters (${total} total)`
    );

    let enrichedCharacters = characters.map((char) =>
      this.toExtendedCharacter(char)
    );

    if (includeStats) {
      enrichedCharacters = await Promise.all(
        enrichedCharacters.map(async (char) => {
          try {
            const stats = await agentDiscoveryService.getAgentStatistics(
              char.id
            );
            return {
              ...char,
              stats: {
                messageCount: stats.messageCount,
                roomCount: 0,
                lastActiveAt: stats.lastActiveAt,
                deploymentStatus: stats.status,
                uptime: stats.uptime,
              },
            };
          } catch (error) {
            logger.warn(
              `[Marketplace Service] Failed to get stats for ${char.id}:`,
              error
            );
            return char;
          }
        })
      );
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
            `[Marketplace Service] Error getting count for category ${category.id}:`,
            error
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

  private toExtendedCharacter(character: UserCharacter): ExtendedCharacter {
    return {
      id: character.id,
      name: character.name,
      username: character.username || undefined,
      system: character.system || undefined,
      bio: character.bio,
      messageExamples: character.message_examples as any,
      postExamples: character.post_examples as string[] | undefined,
      topics: character.topics as string[] | undefined,
      adjectives: character.adjectives as string[] | undefined,
      knowledge: character.knowledge as any,
      plugins: character.plugins as string[] | undefined,
      settings: character.settings as any,
      secrets: character.secrets as any,
      style: character.style as any,
      isTemplate: character.is_template,
      isPublic: character.is_public,
      creatorId: character.user_id,
      avatarUrl: character.avatar_url || undefined,
      category: character.category as any,
      tags: (character.tags as string[]) || undefined,
      featured: character.featured,
      popularity: character.popularity_score,
      viewCount: character.view_count,
      interactionCount: character.interaction_count,
      createdAt: character.created_at,
      updatedAt: character.updated_at,
    };
  }

  private async invalidateUserCache(
    userId: string,
    organizationId: string
  ): Promise<void> {
    await Promise.all([
      marketplaceCache.invalidateSearchResults(organizationId),
      marketplaceCache.invalidateCategories(organizationId),
      agentDiscoveryService.invalidateAgentListCache(organizationId),
    ]);

    logger.debug(
      `[Marketplace Service] Invalidated caches for user: ${userId}`
    );
  }
}

export const marketplaceService = new MarketplaceService();
