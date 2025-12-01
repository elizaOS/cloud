import {
  userCharactersRepository,
  type UserCharacter,
  type NewUserCharacter,
} from "@/db/repositories";
import type { ElizaCharacter } from "@/lib/types";

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
    return await userCharactersRepository.create(data);
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
    const characterData = character.character_data as Record<string, unknown> | undefined;
    const affiliateData = characterData?.affiliate as Record<string, unknown> | undefined;
    
    // Also extract lore data which contains full social media posts
    const loreData = characterData?.lore as string[] | undefined;
    
    // Merge affiliate data AND lore into settings so it's available in the runtime
    const settings = character.settings as Record<string, string | boolean | number | Record<string, unknown>> | undefined;
    const mergedSettings = {
      ...settings,
      // Include avatarUrl in settings for provider/runtime access (camelCase for ElizaOS compatibility)
      avatarUrl: character.avatar_url ?? undefined,
      ...(affiliateData || loreData
        ? {
            affiliateData: {
              ...affiliateData,
              lore: loreData, // Include lore for full social media content
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
      avatar_url: character.avatar_url ?? undefined,
    };
  }
}

// Export singleton instance
export const charactersService = new CharactersService();
