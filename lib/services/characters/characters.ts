/**
 * Service for managing user characters (CRUD operations).
 *
 * PERFORMANCE: Character data is cached in Redis for fast runtime access.
 */

import {
  userCharactersRepository,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/repositories";
import { agentsRepository } from "@/db/repositories/agents/agents";
import { usersService } from "../users";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/db/client";
import { elizaRoomCharactersTable } from "@/db/schemas";
import { eq, and } from "drizzle-orm";
import type { ElizaCharacter } from "@/lib/types";
import type { Agent } from "@elizaos/core";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

// Cache key for character data (longer TTL since characters rarely change)
const characterCacheKey = (id: string) => `character:data:${id}`;
const CHARACTER_CACHE_TTL = CacheTTL.agent.characterData; // 1 hour

/**
 * Service for character CRUD operations.
 */
export class CharactersService {
  /**
   * Get character by ID with caching.
   * PERFORMANCE: Cache hit reduces latency from ~50ms to ~5ms
   */
  async getById(id: string): Promise<UserCharacter | undefined> {
    const cacheKey = characterCacheKey(id);

    // Try cache first
    const cached = await cache.get<UserCharacter>(cacheKey);
    if (cached) {
      logger.debug(`[Characters] ⚡ Cache HIT: ${id}`);
      return cached;
    }

    // Fetch from database
    const character = await userCharactersRepository.findById(id);

    // Cache for future requests (1 hour)
    if (character) {
      await cache.set(cacheKey, character, CHARACTER_CACHE_TTL);
      logger.debug(`[Characters] Cache MISS, cached: ${id}`);
    }

    return character;
  }

  /**
   * Invalidate character cache (call after updates)
   * CRITICAL: This now also invalidates the in-memory runtime cache
   */
  async invalidateCache(id: string): Promise<void> {
    // Import dynamically to avoid circular dependency
    const { invalidateCharacterCache } =
      await import("@/lib/cache/character-cache");

    await Promise.all([
      // Invalidate the simple character cache key
      cache.del(characterCacheKey(id)),
      // CRITICAL: Invalidate ALL character-related caches including runtime
      // This ensures MCP, knowledge, web search changes take effect immediately
      invalidateCharacterCache(id),
    ]);

    logger.info(`[Characters] Cache invalidated for character: ${id}`);
  }

  async getByIdForUser(
    characterId: string,
    userId: string,
  ): Promise<UserCharacter | null> {
    const character = await userCharactersRepository.findById(characterId);

    if (!character || character.user_id !== userId) {
      return null;
    }

    return character;
  }

  async listByUser(
    userId: string,
    options?: {
      limit?: number;
      includeTemplates?: boolean;
      source?: "cloud";
    },
  ): Promise<UserCharacter[]> {
    const source = options?.source ?? "cloud";

    // If templates are requested, get them separately
    if (options?.includeTemplates) {
      const [userChars, templates] = await Promise.all([
        userCharactersRepository.listByUser(userId, source),
        userCharactersRepository.listTemplates(),
      ]);
      return [...userChars, ...templates];
    }

    return await userCharactersRepository.listByUser(userId, source);
  }

  async listByOrganization(
    organizationId: string,
    options?: { source?: "cloud" },
  ): Promise<UserCharacter[]> {
    const source = options?.source ?? "cloud";
    return await userCharactersRepository.listByOrganization(
      organizationId,
      source,
    );
  }

  async listPublic(): Promise<UserCharacter[]> {
    return await userCharactersRepository.listPublic();
  }

  async listTemplates(): Promise<UserCharacter[]> {
    return await userCharactersRepository.listTemplates();
  }

  async create(data: NewUserCharacter): Promise<UserCharacter> {
    // Create the character in user_characters table
    const character = await userCharactersRepository.create(data);

    // Also create the agent in the ElizaOS agents table
    const agent: Partial<Agent> = {
      id: character.id as `${string}-${string}-${string}-${string}-${string}`,
      name: character.name,
      username: character.username ?? undefined,
      bio: character.bio,
      system: character.system ?? undefined,
      enabled: true,
      settings: character.settings as Record<
        string,
        string | number | boolean | Record<string, string | number | boolean>
      >,
    };

    await agentsRepository.create(agent);

    // Invalidate dashboard cache
    await cache.del(CacheKeys.org.dashboard(data.organization_id));

    return character;
  }

  async update(
    id: string,
    data: Partial<NewUserCharacter>,
  ): Promise<UserCharacter | undefined> {
    const updated = await userCharactersRepository.update(id, data);
    // Invalidate cache on update
    if (updated) {
      await this.invalidateCache(id);
    }
    return updated;
  }

  async updateForUser(
    characterId: string,
    userId: string,
    updates: Partial<NewUserCharacter>,
  ): Promise<UserCharacter | null> {
    // Verify ownership
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) {
      return null;
    }

    const updated = await userCharactersRepository.update(characterId, updates);

    // CRITICAL: Invalidate cache after update (including runtime cache)
    // This ensures the next request creates a fresh runtime with updated config
    if (updated) {
      await this.invalidateCache(characterId);
    }

    return updated || null;
  }

  async delete(id: string): Promise<void> {
    const character = await this.getById(id);
    await userCharactersRepository.delete(id);
    if (character) {
      await Promise.all([
        cache.del(CacheKeys.org.dashboard(character.organization_id)),
        this.invalidateCache(id),
      ]);
    }
  }

  async deleteForUser(characterId: string, userId: string): Promise<boolean> {
    // Verify ownership
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) {
      return false;
    }

    await userCharactersRepository.delete(characterId);

    // CRITICAL: Invalidate cache after delete (including runtime cache)
    await Promise.all([
      cache.del(CacheKeys.org.dashboard(character.organization_id)),
      this.invalidateCache(characterId),
    ]);

    return true;
  }

  /**
   * Convert database character to Eliza character format
   */
  toElizaCharacter(character: UserCharacter): ElizaCharacter {
    // Extract affiliate data from character_data if present
    const characterData = character.character_data as
      | Record<string, unknown>
      | undefined;
    const affiliateData = characterData?.affiliate as
      | { vibe?: string; affiliateId?: string; [key: string]: unknown }
      | undefined;

    // Also extract lore data which contains full social media posts
    const loreData = characterData?.lore as string[] | undefined;

    // Merge affiliate data AND lore into settings so it's available in the runtime
    const settings = character.settings as
      | Record<string, string | boolean | number | Record<string, unknown>>
      | undefined;
    const mergedSettings = {
      ...settings,
      // Include avatarUrl in settings for provider/runtime access (camelCase for ElizaOS compatibility)
      avatarUrl: character.avatar_url ?? undefined,
      ...(affiliateData || loreData
        ? {
            affiliateData: {
              ...affiliateData,
              lore: loreData,
            },
          }
        : {}),
    };

    return {
      id: character.id,
      name: character.name,
      username: character.username ?? undefined,
      system: character.system ?? undefined,
      bio: character.bio,
      messageExamples: (() => {
        const examples = character.message_examples;
        if (
          Array.isArray(examples) &&
          examples.every(
            (ex) =>
              Array.isArray(ex) &&
              ex.every(
                (msg) =>
                  typeof msg === "object" &&
                  msg !== null &&
                  "name" in msg &&
                  "content" in msg,
              ),
          )
        ) {
          return examples as ElizaCharacter["messageExamples"];
        }
        return undefined;
      })(),
      postExamples: character.post_examples as string[] | undefined,
      topics: character.topics as string[] | undefined,
      adjectives: character.adjectives as string[] | undefined,
      knowledge: character.knowledge as
        | (string | { path: string; shared?: boolean })[]
        | undefined,
      plugins: character.plugins as string[] | undefined,
      settings: mergedSettings as
        | Record<string, string | number | boolean | Record<string, unknown>>
        | undefined,
      secrets: character.secrets as
        | Record<string, string | number | boolean>
        | undefined,
      style: character.style as
        | {
            all?: string[];
            chat?: string[];
            post?: string[];
          }
        | undefined,
      avatarUrl: character.avatar_url ?? undefined,
    };
  }

  /**
   * Check if a character is claimable by an authenticated user.
   * A character is claimable if:
   * - It's owned by an anonymous user (affiliate-created)
   * - The owner has an affiliate email pattern
   * - The owner hasn't been converted to a real user yet
   */
  async isClaimableAffiliateCharacter(characterId: string): Promise<{
    claimable: boolean;
    ownerId?: string;
    reason?: string;
  }> {
    const character = await userCharactersRepository.findById(characterId);

    if (!character) {
      return { claimable: false, reason: "Character not found" };
    }

    // Get the owner user
    const owner = await usersService.getById(character.user_id);

    if (!owner) {
      return { claimable: false, reason: "Owner not found" };
    }

    // Check if owned by an affiliate anonymous user
    const isAffiliateUser =
      owner.email?.includes("@anonymous.elizacloud.ai") || false;
    const isAnonymous = owner.is_anonymous === true;
    const hasNoPrivyId = !owner.privy_user_id;

    if (isAffiliateUser && (isAnonymous || hasNoPrivyId)) {
      return {
        claimable: true,
        ownerId: owner.id,
        reason: "Affiliate character available for claiming",
      };
    }

    return {
      claimable: false,
      reason: "Character already owned by a real user",
    };
  }

  /**
   * Claim an affiliate character for an authenticated user.
   * Transfers ownership from the anonymous affiliate user to the authenticated user.
   * Also transfers room associations so the character appears in the user's library.
   */
  async claimAffiliateCharacter(
    characterId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verify character is claimable
    const claimCheck = await this.isClaimableAffiliateCharacter(characterId);

    if (!claimCheck.claimable) {
      logger.info(
        `[Characters] Character ${characterId} not claimable: ${claimCheck.reason}`,
      );
      return { success: false, message: claimCheck.reason || "Not claimable" };
    }

    const previousOwnerId = claimCheck.ownerId;
    logger.info(
      `[Characters] 🎯 Claiming affiliate character ${characterId} for user ${userId}`,
      {
        previousOwnerId,
      },
    );

    // Transfer character ownership
    const updated = await userCharactersRepository.update(characterId, {
      user_id: userId,
      organization_id: organizationId,
    });

    if (!updated) {
      return { success: false, message: "Failed to update character" };
    }

    // Transfer room associations from the previous owner to the new owner
    if (previousOwnerId) {
      const roomUpdateResult = await dbWrite
        .update(elizaRoomCharactersTable)
        .set({
          user_id: userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(elizaRoomCharactersTable.character_id, characterId),
            eq(elizaRoomCharactersTable.user_id, previousOwnerId),
          ),
        )
        .returning({ room_id: elizaRoomCharactersTable.room_id });

      if (roomUpdateResult.length > 0) {
        logger.info(
          `[Characters] Transferred ${roomUpdateResult.length} room association(s)`,
          {
            characterId,
            fromUserId: previousOwnerId,
            toUserId: userId,
          },
        );
      }
    }

    logger.info(
      `[Characters] ✅ Successfully claimed character ${characterId}`,
      {
        characterName: updated.name,
        newOwnerId: userId,
        newOrgId: organizationId,
      },
    );

    return {
      success: true,
      message: `Character "${updated.name}" has been added to your account`,
    };
  }
}

// Export singleton instance
export const charactersService = new CharactersService();
