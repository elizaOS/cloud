"use server";

import { requireAuthWithOrg } from "@/lib/auth";
import { charactersService, discordService } from "@/lib/services";
import type { ElizaCharacter, NewUserCharacter } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { uploadToBlob } from "@/lib/blob";

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
    avatar_url: elizaCharacter.avatarUrl ?? null,
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
    avatar_url: elizaCharacter.avatarUrl ?? null,
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

interface UploadAvatarParams {
  base64Data: string;
  fileName: string;
  fileType: string;
  characterId?: string;
}

/**
 * Upload avatar for a character
 */
export async function uploadCharacterAvatar(params: UploadAvatarParams) {
  try {
    const user = await requireAuthWithOrg();
    const { base64Data, fileName, fileType, characterId } = params;

    // Validate base64 data
    if (!base64Data || !base64Data.startsWith("data:")) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(fileType)) {
      return {
        success: false,
        error: `Invalid file type: ${fileType}. Only JPEG, PNG, WebP, and GIF are allowed.`,
      };
    }

    // Extract base64 content and convert to buffer
    const base64Content = base64Data.split(",")[1];
    if (!base64Content) {
      return {
        success: false,
        error: "Invalid file data",
      };
    }
    const buffer = Buffer.from(base64Content, "base64");

    // Validate file size (5MB max)
    if (buffer.length > 5 * 1024 * 1024) {
      return {
        success: false,
        error: "File too large. Maximum size is 5MB.",
      };
    }

    // Get file extension
    const extension = fileType.split("/")[1] || "png";
    const filename = `avatar-${characterId || "new"}-${Date.now()}.${extension}`;

    // Upload to Vercel Blob
    const blobResult = await uploadToBlob(buffer, {
      filename,
      contentType: fileType,
      folder: "avatars",
      userId: user.id,
    });

    // If characterId is provided, update the character's avatar_url
    if (characterId) {
      await charactersService.updateForUser(characterId, user.id, {
        avatar_url: blobResult.url,
      });
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/chat");
      revalidatePath("/dashboard/build");
    }

    return {
      success: true,
      avatarUrl: blobResult.url,
      message: "Avatar uploaded successfully",
    };
  } catch (error) {
    console.error("Error uploading character avatar:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upload avatar. Please try again.",
    };
  }
}
