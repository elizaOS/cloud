import { cache as cacheClient } from "./client";
import { logger } from "@/lib/utils/logger";
import type {
  MarketplaceSearchResult,
  ExtendedCharacter,
  CategoryInfo,
} from "@/lib/types/marketplace";
import { createHash } from "node:crypto";

export class MarketplaceCache {
  private readonly MARKETPLACE_PREFIX = "marketplace";
  private readonly DEFAULT_TTL = 300; // 5 minutes

  private createKey(...parts: string[]): string {
    return [this.MARKETPLACE_PREFIX, ...parts].join(":");
  }

  private hashFilters(filters: Record<string, unknown>): string {
    const filterStr = JSON.stringify(filters);
    // Use full SHA-256 hash to avoid collisions (birthday paradox)
    return createHash("sha256").update(filterStr).digest("hex");
  }

  async getSearchResult(
    organizationId: string,
    filterHash: string,
  ): Promise<MarketplaceSearchResult | null> {
    const key = this.createKey("search", organizationId, filterHash);

    const cached = await cacheClient.get<MarketplaceSearchResult>(key);
    if (cached) {
      logger.debug(
        `[Marketplace Cache] Cache hit for search: ${organizationId}:${filterHash}`,
      );
    }
    return cached;
  }

  async setSearchResult(
    organizationId: string,
    filterHash: string,
    result: MarketplaceSearchResult,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.createKey("search", organizationId, filterHash);

    await cacheClient.set(key, result, ttl);
    logger.debug(
      `[Marketplace Cache] Cached search result: ${organizationId}:${filterHash}`,
    );
  }

  async getCharacter(characterId: string): Promise<ExtendedCharacter | null> {
    const key = this.createKey("character", characterId);

    const cached = await cacheClient.get<ExtendedCharacter>(key);
    if (cached) {
      logger.debug(
        `[Marketplace Cache] Cache hit for character: ${characterId}`,
      );
    }
    return cached;
  }

  async setCharacter(
    characterId: string,
    character: ExtendedCharacter,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.createKey("character", characterId);

    await cacheClient.set(key, character, ttl);
    logger.debug(`[Marketplace Cache] Cached character: ${characterId}`);
  }

  async getCategories(organizationId: string): Promise<CategoryInfo[] | null> {
    const key = this.createKey("categories", organizationId);

    const cached = await cacheClient.get<CategoryInfo[]>(key);
    if (cached) {
      logger.debug(
        `[Marketplace Cache] Cache hit for categories: ${organizationId}`,
      );
    }
    return cached;
  }

  async setCategories(
    organizationId: string,
    categories: CategoryInfo[],
    ttl: number = 600, // 10 minutes for categories
  ): Promise<void> {
    const key = this.createKey("categories", organizationId);

    await cacheClient.set(key, categories, ttl);
    logger.debug(`[Marketplace Cache] Cached categories: ${organizationId}`);
  }

  async invalidateSearchResults(organizationId: string): Promise<void> {
    const pattern = this.createKey("search", organizationId, "*");

    await cacheClient.delPattern(pattern);
    logger.debug(
      `[Marketplace Cache] Invalidated search results for: ${organizationId}`,
    );
  }

  async invalidateCharacter(characterId: string): Promise<void> {
    const key = this.createKey("character", characterId);

    await cacheClient.del(key);
    logger.debug(`[Marketplace Cache] Invalidated character: ${characterId}`);
  }

  async invalidateCategories(organizationId: string): Promise<void> {
    const key = this.createKey("categories", organizationId);

    await cacheClient.del(key);
    logger.debug(
      `[Marketplace Cache] Invalidated categories for: ${organizationId}`,
    );
  }

  /**
   * Invalidate only caches affected by a specific character category
   * More granular than invalidateAll
   * @param organizationId - Organization ID
   * @param category - Category that was affected (optional)
   */
  async invalidateByCategory(
    organizationId: string,
    category?: string,
  ): Promise<void> {
    // Invalidate only category counts if category specified
    if (category) {
      await this.invalidateCategories(organizationId);
      logger.debug(
        `[Marketplace Cache] Invalidated category caches for: ${organizationId}`,
      );
    } else {
      // If no category, invalidate all as we don't know what's affected
      await this.invalidateAll(organizationId);
    }
  }

  /**
   * Invalidate all marketplace cache (use sparingly)
   * @param organizationId - Organization ID
   */
  async invalidateAll(organizationId: string): Promise<void> {
    await Promise.all([
      this.invalidateSearchResults(organizationId),
      this.invalidateCategories(organizationId),
    ]);
    logger.debug(
      `[Marketplace Cache] Invalidated all marketplace cache for: ${organizationId}`,
    );
  }

  createFilterHash(filters: Record<string, unknown>): string {
    return this.hashFilters(filters);
  }
}

export const marketplaceCache = new MarketplaceCache();
