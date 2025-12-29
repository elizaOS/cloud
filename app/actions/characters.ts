/**
 * Characters actions.
 *
 * This module re-exports client API functions for character operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import { charactersApi, type ElizaCharacter } from "@/lib/api/client";

export type { ElizaCharacter };

/**
 * Uploads a character avatar image to blob storage.
 */
export async function uploadCharacterAvatar(formData: FormData) {
  const file = formData.get("file") as File;

  if (!file) {
    return { success: false, error: "No file provided" };
  }

  const response = await charactersApi.uploadAvatar(file);
  return { success: response.success, url: response.url };
}

/**
 * Creates a new character for the authenticated user's organization.
 */
export async function createCharacter(elizaCharacter: ElizaCharacter) {
  const response = await charactersApi.create(elizaCharacter);
  return response.data.character;
}

/**
 * Updates an existing character owned by the authenticated user.
 */
export async function updateCharacter(
  characterId: string,
  elizaCharacter: ElizaCharacter,
) {
  const response = await charactersApi.update(characterId, elizaCharacter);
  return response.data.character;
}

/**
 * Deletes a character owned by the authenticated user.
 */
export async function deleteCharacter(characterId: string) {
  const response = await charactersApi.delete(characterId);
  return { success: response.success };
}

/**
 * Lists all characters owned by the authenticated user.
 */
export async function listCharacters() {
  const response = await charactersApi.list();
  return response.data.characters;
}

/**
 * Gets a specific character owned by the authenticated user.
 */
export async function getCharacter(characterId: string) {
  const response = await charactersApi.get(characterId);
  return response.data.character;
}
