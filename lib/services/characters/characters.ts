/**
 * Service for managing user characters (CRUD operations).
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
import { CacheKeys } from "@/lib/cache/keys";

/**
 * Service for character CRUD operations.
 */
export class CharactersService {
  async getById(id: string): Promise<UserCharacter | undefined> {
    return await userCharactersRepository.findById(id);
  }

  async getByIdForUser(
    characterId: string,
    userId: string,
  ): Promise<UserCharacter | null> {
    const character = await userCharactersRepository.findById(characterId);
    if (!character || character.user_id !== userId) return null;
    return character;
  }

  async listByUser(
    userId: string,
    options?: {
      limit?: number;
      includeTemplates?: boolean;
      source?: "cloud" | "app";
    },
  ): Promise<UserCharacter[]> {
    const source = options?.source ?? "cloud";

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
    options?: { source?: "cloud" | "app" },
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
    const character = await userCharactersRepository.create(data);

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
    return await userCharactersRepository.update(id, data);
  }

  async updateForUser(
    characterId: string,
    userId: string,
    updates: Partial<NewUserCharacter>,
  ): Promise<UserCharacter | null> {
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) return null;

    const updated = await userCharactersRepository.update(characterId, updates);
    return updated || null;
  }

  async delete(id: string): Promise<void> {
    const character = await this.getById(id);
    await userCharactersRepository.delete(id);
    if (character) {
      await cache.del(CacheKeys.org.dashboard(character.organization_id));
    }
  }

  async deleteForUser(characterId: string, userId: string): Promise<boolean> {
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) return false;

    await userCharactersRepository.delete(characterId);
    return true;
  }

  toElizaCharacter(character: UserCharacter): ElizaCharacter {
    const characterData = character.character_data as
      | Record<string, unknown>
      | undefined;
    const affiliateData = characterData?.affiliate as
      | { vibe?: string; affiliateId?: string; [key: string]: unknown }
      | undefined;
    const loreData = characterData?.lore as string[] | undefined;

    const settings = character.settings as
      | Record<string, string | boolean | number | Record<string, unknown>>
      | undefined;
    const mergedSettings = {
      ...settings,
      avatarUrl: character.avatar_url ?? undefined,
      ...(affiliateData || loreData
        ? { affiliateData: { ...affiliateData, lore: loreData } }
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
        | { all?: string[]; chat?: string[]; post?: string[] }
        | undefined,
      avatarUrl: character.avatar_url ?? undefined,
    };
  }

  async isClaimableAffiliateCharacter(characterId: string): Promise<{
    claimable: boolean;
    ownerId?: string;
    reason?: string;
  }> {
    const character = await userCharactersRepository.findById(characterId);
    if (!character) return { claimable: false, reason: "Character not found" };

    const owner = await usersService.getById(character.user_id);
    if (!owner) return { claimable: false, reason: "Owner not found" };

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

  async claimAffiliateCharacter(
    characterId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const claimCheck = await this.isClaimableAffiliateCharacter(characterId);

    if (!claimCheck.claimable) {
      logger.info(
        `[Characters] Character ${characterId} not claimable: ${claimCheck.reason}`,
      );
      return { success: false, message: claimCheck.reason || "Not claimable" };
    }

    const previousOwnerId = claimCheck.ownerId;
    logger.info(
      `[Characters] Claiming affiliate character ${characterId} for user ${userId}`,
      { previousOwnerId },
    );

    const updated = await userCharactersRepository.update(characterId, {
      user_id: userId,
      organization_id: organizationId,
    });

    if (!updated)
      return { success: false, message: "Failed to update character" };

    if (previousOwnerId) {
      const roomUpdateResult = await dbWrite
        .update(elizaRoomCharactersTable)
        .set({ user_id: userId, updated_at: new Date() })
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

    logger.info(`[Characters] Successfully claimed character ${characterId}`, {
      characterName: updated.name,
      newOwnerId: userId,
      newOrgId: organizationId,
    });

    return {
      success: true,
      message: `Character "${updated.name}" has been added to your account`,
    };
  }
}

export const charactersService = new CharactersService();
