import { cache as cacheClient } from "./client";
import { logger } from "@/lib/utils/logger";
import type {
  MarketplaceSearchResult,
  ExtendedCharacter,
  CategoryInfo,
} from "@/lib/types/marketplace";
import { createHash } from "crypto";

export class MarketplaceCache {
  private readonly MARKETPLACE_PREFIX = "marketplace";
  private readonly DEFAULT_TTL = 300; // 5 minutes

  private createKey(...parts: string[]): string {
    return [this.MARKETPLACE_PREFIX, ...parts].join(":");
  }

  private hashFilters(filters: Record<string, unknown>): string {
    const filterStr = JSON.stringify(filters);
    return createHash("md5").update(filterStr).digest("hex").substring(0, 8);
  }

  async getSearchResult(
    organizationId: string,
    filterHash: string,
  ): Promise<MarketplaceSearchResult | null> {
    const key = this.createKey("search", organizationId, filterHash);

    try {
      const cached = await cacheClient.get<MarketplaceSearchResult>(key);
      if (cached) {
        logger.debug(
          `[Marketplace Cache] Cache hit for search: ${organizationId}:${filterHash}`,
        );
      }
      return cached;
    } catch (error) {
      logger.error("[Marketplace Cache] Error getting search result:", error);
      return null;
    }
  }

  async setSearchResult(
    organizationId: string,
    filterHash: string,
    result: MarketplaceSearchResult,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.createKey("search", organizationId, filterHash);

    try {
      await cacheClient.set(key, result, ttl);
      logger.debug(
        `[Marketplace Cache] Cached search result: ${organizationId}:${filterHash}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error setting search result:", error);
    }
  }

  async getCharacter(characterId: string): Promise<ExtendedCharacter | null> {
    const key = this.createKey("character", characterId);

    try {
      const cached = await cacheClient.get<ExtendedCharacter>(key);
      if (cached) {
        logger.debug(
          `[Marketplace Cache] Cache hit for character: ${characterId}`,
        );
      }
      return cached;
    } catch (error) {
      logger.error("[Marketplace Cache] Error getting character:", error);
      return null;
    }
  }

  async setCharacter(
    characterId: string,
    character: ExtendedCharacter,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.createKey("character", characterId);

    try {
      await cacheClient.set(key, character, ttl);
      logger.debug(
        `[Marketplace Cache] Cached character: ${characterId}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error setting character:", error);
    }
  }

  async getCategories(
    organizationId: string,
  ): Promise<CategoryInfo[] | null> {
    const key = this.createKey("categories", organizationId);

    try {
      const cached = await cacheClient.get<CategoryInfo[]>(key);
      if (cached) {
        logger.debug(
          `[Marketplace Cache] Cache hit for categories: ${organizationId}`,
        );
      }
      return cached;
    } catch (error) {
      logger.error("[Marketplace Cache] Error getting categories:", error);
      return null;
    }
  }

  async setCategories(
    organizationId: string,
    categories: CategoryInfo[],
    ttl: number = 600, // 10 minutes for categories
  ): Promise<void> {
    const key = this.createKey("categories", organizationId);

    try {
      await cacheClient.set(key, categories, ttl);
      logger.debug(
        `[Marketplace Cache] Cached categories: ${organizationId}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error setting categories:", error);
    }
  }

  async invalidateSearchResults(organizationId: string): Promise<void> {
    const pattern = this.createKey("search", organizationId, "*");

    try {
      await cacheClient.delPattern(pattern);
      logger.debug(
        `[Marketplace Cache] Invalidated search results for: ${organizationId}`,
      );
    } catch (error) {
      logger.error(
        "[Marketplace Cache] Error invalidating search results:",
        error,
      );
    }
  }

  async invalidateCharacter(characterId: string): Promise<void> {
    const key = this.createKey("character", characterId);

    try {
      await cacheClient.del(key);
      logger.debug(
        `[Marketplace Cache] Invalidated character: ${characterId}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error invalidating character:", error);
    }
  }

  async invalidateCategories(organizationId: string): Promise<void> {
    const key = this.createKey("categories", organizationId);

    try {
      await cacheClient.del(key);
      logger.debug(
        `[Marketplace Cache] Invalidated categories for: ${organizationId}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error invalidating categories:", error);
    }
  }

  async invalidateAll(organizationId: string): Promise<void> {
    try {
      await Promise.all([
        this.invalidateSearchResults(organizationId),
        this.invalidateCategories(organizationId),
      ]);
      logger.debug(
        `[Marketplace Cache] Invalidated all marketplace cache for: ${organizationId}`,
      );
    } catch (error) {
      logger.error("[Marketplace Cache] Error invalidating all:", error);
    }
  }

  createFilterHash(filters: Record<string, unknown>): string {
    return this.hashFilters(filters);
  }
}

export const marketplaceCache = new MarketplaceCache();
