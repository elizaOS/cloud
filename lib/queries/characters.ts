import { db } from "@/db/drizzle";
import { userCharacters } from "@/db/sass/schema";
import { and, eq, desc } from "drizzle-orm";
import type {
  UserCharacter,
  NewUserCharacter,
  ElizaCharacter,
} from "@/lib/types";

/**
 * List all characters for a user
 */
export async function listCharactersByUser(
  userId: string,
  options?: {
    limit?: number;
    includeTemplates?: boolean;
  },
): Promise<UserCharacter[]> {
  const conditions = [eq(userCharacters.user_id, userId)];

  if (!options?.includeTemplates) {
    conditions.push(eq(userCharacters.is_template, false));
  }

  return db
    .select()
    .from(userCharacters)
    .where(and(...conditions))
    .orderBy(desc(userCharacters.updated_at))
    .limit(options?.limit ?? 100);
}

/**
 * Get a character by ID
 */
export async function getCharacterById(
  characterId: string,
  userId: string,
): Promise<UserCharacter | null> {
  const results = await db
    .select()
    .from(userCharacters)
    .where(
      and(
        eq(userCharacters.id, characterId),
        eq(userCharacters.user_id, userId),
      ),
    )
    .limit(1);

  return results[0] || null;
}

/**
 * Create a new character
 */
export async function createCharacter(
  character: NewUserCharacter,
): Promise<UserCharacter> {
  const results = await db
    .insert(userCharacters)
    .values({
      ...character,
      updated_at: new Date(),
    })
    .returning();

  return results[0];
}

/**
 * Update an existing character
 */
export async function updateCharacter(
  characterId: string,
  userId: string,
  updates: Partial<NewUserCharacter>,
): Promise<UserCharacter | null> {
  const results = await db
    .update(userCharacters)
    .set({
      ...updates,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(userCharacters.id, characterId),
        eq(userCharacters.user_id, userId),
      ),
    )
    .returning();

  return results[0] || null;
}

/**
 * Delete a character
 */
export async function deleteCharacter(
  characterId: string,
  userId: string,
): Promise<boolean> {
  const results = await db
    .delete(userCharacters)
    .where(
      and(
        eq(userCharacters.id, characterId),
        eq(userCharacters.user_id, userId),
      ),
    )
    .returning();

  return results.length > 0;
}

/**
 * Convert database character to Eliza character format
 */
export function toElizaCharacter(character: UserCharacter): ElizaCharacter {
  return {
    id: character.id,
    name: character.name,
    username: character.username ?? undefined,
    system: character.system ?? undefined,
    bio: character.bio,
    messageExamples: (character.message_examples as unknown[]) as
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
    settings: character.settings as
      | Record<string, string | boolean | number | Record<string, unknown>>
      | undefined,
    secrets: character.secrets as
      | Record<string, string | boolean | number>
      | undefined,
    style: character.style as
      | {
          all?: string[];
          chat?: string[];
          post?: string[];
        }
      | undefined,
  };
}

