"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService, discordService } from "@/lib/services";
import type { ElizaCharacter, NewUserCharacter } from "@/lib/types";
import { revalidatePath } from "next/cache";

/**
 * Create a new character
 */
export async function createCharacter(elizaCharacter: ElizaCharacter) {
  const user = await requireAuthWithOrg();

  const newCharacter: NewUserCharacter = {
    organization_id: user.organization_id!!,
    user_id: user.id,
    name: elizaCharacter.name,
    username: elizaCharacter.username ?? null,
    system: elizaCharacter.system ?? null,
    bio: elizaCharacter.bio,
    message_examples: (elizaCharacter.messageExamples ?? []) as Record<
      string,
      unknown
    >[][],
    post_examples: elizaCharacter.postExamples ?? [],
    topics: elizaCharacter.topics ?? [],
    adjectives: elizaCharacter.adjectives ?? [],
    knowledge: elizaCharacter.knowledge ?? [],
    plugins: elizaCharacter.plugins ?? [],
    settings: elizaCharacter.settings ?? {},
    secrets: elizaCharacter.secrets ?? {},
    style: elizaCharacter.style ?? {},
    character_data: elizaCharacter as unknown as Record<string, unknown>,
    is_template: false,
    is_public: false,
  };

  const character = await charactersService.create(newCharacter);

  // Log to Discord (fire-and-forget)
  discordService
    .logCharacterCreated({
      characterId: character.id,
      characterName: character.name,
      userName: user.name || user.email || null,
      userId: user.id,
      organizationName: user.organization.name,
      bio: Array.isArray(elizaCharacter.bio)
        ? elizaCharacter.bio.join(" ")
        : elizaCharacter.bio,
      plugins: elizaCharacter.plugins,
    })
    .catch((error) => {
      console.error("[CharacterCreate] Failed to log to Discord:", error);
    });

  revalidatePath("/dashboard/character-creator");
  return charactersService.toElizaCharacter(character);
}

/**
 * Update an existing character
 */
export async function updateCharacter(
  characterId: string,
  elizaCharacter: ElizaCharacter,
) {
  const user = await requireAuthWithOrg();

  const updates: Partial<NewUserCharacter> = {
    name: elizaCharacter.name,
    username: elizaCharacter.username ?? null,
    system: elizaCharacter.system ?? null,
    bio: elizaCharacter.bio,
    message_examples: (elizaCharacter.messageExamples ?? []) as Record<
      string,
      unknown
    >[][],
    post_examples: elizaCharacter.postExamples ?? [],
    topics: elizaCharacter.topics ?? [],
    adjectives: elizaCharacter.adjectives ?? [],
    knowledge: elizaCharacter.knowledge ?? [],
    plugins: elizaCharacter.plugins ?? [],
    settings: elizaCharacter.settings ?? {},
    secrets: elizaCharacter.secrets ?? {},
    style: elizaCharacter.style ?? {},
    character_data: elizaCharacter as unknown as Record<string, unknown>,
  };

  const character = await charactersService.updateForUser(
    characterId,
    user.id,
    updates,
  );

  if (!character) {
    throw new Error("Character not found or access denied");
  }

  revalidatePath("/dashboard/character-creator");
  return charactersService.toElizaCharacter(character);
}

/**
 * Delete a character
 */
export async function deleteCharacter(characterId: string) {
  const user = await requireAuthWithOrg();

  const success = await charactersService.deleteForUser(characterId, user.id);

  if (!success) {
    throw new Error("Character not found or access denied");
  }

  revalidatePath("/dashboard/character-creator");
  return { success: true };
}

/**
 * List all characters for the current user
 */
export async function listCharacters() {
  const user = await requireAuthWithOrg();

  const characters = await charactersService.listByUser(user.id, {
    includeTemplates: false,
  });

  return characters.map((c) => charactersService.toElizaCharacter(c));
}

/**
 * Get a specific character
 */
export async function getCharacter(characterId: string) {
  const user = await requireAuthWithOrg();

  const character = await charactersService.getByIdForUser(
    characterId,
    user.id,
  );

  if (!character) {
    throw new Error("Character not found");
  }

  return charactersService.toElizaCharacter(character);
}
