"use server";

import { requireAuth } from "@/lib/auth";
import { charactersService } from "@/lib/services";
import type { ElizaCharacter, NewUserCharacter } from "@/lib/types";
import { revalidatePath } from "next/cache";

/**
 * Create a new character
 */
export async function createCharacter(elizaCharacter: ElizaCharacter) {
  const user = await requireAuth();

  const newCharacter: NewUserCharacter = {
    organization_id: user.organization_id,
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
  const user = await requireAuth();

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
  const user = await requireAuth();

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
  const user = await requireAuth();

  const characters = await charactersService.listByUser(user.id, {
    includeTemplates: false,
  });

  return characters.map((c) => charactersService.toElizaCharacter(c));
}

/**
 * Get a specific character
 */
export async function getCharacter(characterId: string) {
  const user = await requireAuth();

  const character = await charactersService.getByIdForUser(
    characterId,
    user.id,
  );

  if (!character) {
    throw new Error("Character not found");
  }

  return charactersService.toElizaCharacter(character);
}
