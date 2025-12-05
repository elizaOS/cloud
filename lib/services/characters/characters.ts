import {
  userCharactersRepository,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/repositories";
import { agentsRepository } from "@/db/repositories/agents/agents";
import type { ElizaCharacter } from "@/lib/types";
import type { Agent } from "@elizaos/core";

export class CharactersService {
  async getById(id: string): Promise<UserCharacter | undefined> {
    return await userCharactersRepository.findById(id);
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
    },
  ): Promise<UserCharacter[]> {
    // If templates are requested, get them separately
    if (options?.includeTemplates) {
      const [userChars, templates] = await Promise.all([
        userCharactersRepository.listByUser(userId),
        userCharactersRepository.listTemplates(),
      ]);
      return [...userChars, ...templates];
    }

    return await userCharactersRepository.listByUser(userId);
  }

  async listByOrganization(organizationId: string): Promise<UserCharacter[]> {
    return await userCharactersRepository.listByOrganization(organizationId);
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
    // Verify ownership
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) {
      return null;
    }

    const updated = await userCharactersRepository.update(characterId, updates);
    return updated || null;
  }

  async delete(id: string): Promise<void> {
    await userCharactersRepository.delete(id);
  }

  async deleteForUser(characterId: string, userId: string): Promise<boolean> {
    // Verify ownership
    const character = await this.getByIdForUser(characterId, userId);
    if (!character) {
      return false;
    }

    await userCharactersRepository.delete(characterId);
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
      | Record<string, unknown>
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
      messageExamples: character.message_examples as unknown[] as
        | Array<
            Array<{
              name: string;
              content: {
                text: string;
                action?: string;
                [key: string]: unknown;
              };
            }>
          >
        | undefined,
      postExamples: character.post_examples as string[] | undefined,
      topics: character.topics as string[] | undefined,
      adjectives: character.adjectives as string[] | undefined,
      knowledge: character.knowledge as
        | (string | { path: string; shared?: boolean })[]
        | undefined,
      plugins: character.plugins as string[] | undefined,
      settings: mergedSettings as Record<string, string | number | boolean | Record<string, unknown>> | undefined,
      secrets: character.secrets as Record<string, string | number | boolean> | undefined,
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
    const { usersService } = await import("../users");
    const owner = await usersService.getById(character.user_id);
    
    if (!owner) {
      return { claimable: false, reason: "Owner not found" };
    }

    // Check if owned by an affiliate anonymous user
    const isAffiliateUser = owner.email?.includes("@anonymous.elizacloud.ai") || false;
    const isAnonymous = owner.is_anonymous === true;
    const hasNoPrivyId = !owner.privy_user_id;

    if (isAffiliateUser && (isAnonymous || hasNoPrivyId)) {
      return { 
        claimable: true, 
        ownerId: owner.id,
        reason: "Affiliate character available for claiming"
      };
    }

    return { claimable: false, reason: "Character already owned by a real user" };
  }

  /**
   * Claim an affiliate character for an authenticated user.
   * Transfers ownership from the anonymous affiliate user to the authenticated user.
   * Also transfers room associations so the character appears in the user's library.
   */
  async claimAffiliateCharacter(
    characterId: string,
    userId: string,
    organizationId: string
  ): Promise<{ success: boolean; message: string }> {
    const { logger } = await import("@/lib/utils/logger");
    const { db } = await import("@/db/client");
    const { elizaRoomCharactersTable } = await import("@/db/schemas");
    const { eq, and } = await import("drizzle-orm");

    // Verify character is claimable
    const claimCheck = await this.isClaimableAffiliateCharacter(characterId);

    if (!claimCheck.claimable) {
      logger.info(`[Characters] Character ${characterId} not claimable: ${claimCheck.reason}`);
      return { success: false, message: claimCheck.reason || "Not claimable" };
    }

    const previousOwnerId = claimCheck.ownerId;
    logger.info(`[Characters] 🎯 Claiming affiliate character ${characterId} for user ${userId}`, {
      previousOwnerId,
    });

    try {
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
        const roomUpdateResult = await db
          .update(elizaRoomCharactersTable)
          .set({
            user_id: userId,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(elizaRoomCharactersTable.character_id, characterId),
              eq(elizaRoomCharactersTable.user_id, previousOwnerId)
            )
          )
          .returning({ room_id: elizaRoomCharactersTable.room_id });

        if (roomUpdateResult.length > 0) {
          logger.info(`[Characters] Transferred ${roomUpdateResult.length} room association(s)`, {
            characterId,
            fromUserId: previousOwnerId,
            toUserId: userId,
          });
        }
      }

      logger.info(`[Characters] ✅ Successfully claimed character ${characterId}`, {
        characterName: updated.name,
        newOwnerId: userId,
        newOrgId: organizationId,
      });

      return {
        success: true,
        message: `Character "${updated.name}" has been added to your account`
      };
    } catch (error) {
      logger.error(`[Characters] ❌ Failed to claim character:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to claim character"
      };
    }
  }
}

// Export singleton instance
export const charactersService = new CharactersService();
