import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  elizaRoomCharactersTable,
  type ElizaRoomCharacter,
  type NewElizaRoomCharacter,
} from "../schemas";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

export const elizaRoomCharactersRepository = {
  async findByRoomId(roomId: string): Promise<ElizaRoomCharacter | undefined> {
    // Try cache first - room character mappings rarely change
    const cacheKey = CacheKeys.eliza.roomCharacter(roomId);
    const cached = await cache.get<ElizaRoomCharacter | null>(cacheKey);

    if (cached !== undefined) {
      return cached || undefined;
    }

    // Cache miss - fetch from DB
    const result = await db
      .select()
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.room_id, roomId))
      .limit(1);

    const character = result[0];

    // Cache the result (including null/undefined for rooms without character mappings)
    await cache.set(cacheKey, character || null, CacheTTL.eliza.roomCharacter);

    return character;
  },

  async findByRoomIds(roomIds: string[]): Promise<Map<string, string>> {
    if (roomIds.length === 0) {
      return new Map();
    }

    const results = await db
      .select()
      .from(elizaRoomCharactersTable)
      .where(inArray(elizaRoomCharactersTable.room_id, roomIds));

    const mappings = new Map<string, string>();
    for (const result of results) {
      mappings.set(result.room_id, result.character_id);
    }

    return mappings;
  },

  async create(data: NewElizaRoomCharacter): Promise<ElizaRoomCharacter> {
    const result = await db
      .insert(elizaRoomCharactersTable)
      .values(data)
      .returning();

    // Invalidate cache when creating new character mapping
    await cache.del(CacheKeys.eliza.roomCharacter(data.room_id));

    return result[0];
  },

  async update(
    roomId: string,
    characterId: string,
  ): Promise<ElizaRoomCharacter | undefined> {
    const result = await db
      .update(elizaRoomCharactersTable)
      .set({
        character_id: characterId,
        updated_at: new Date(),
      })
      .where(eq(elizaRoomCharactersTable.room_id, roomId))
      .returning();

    // Invalidate cache when updating character mapping
    await cache.del(CacheKeys.eliza.roomCharacter(roomId));

    return result[0];
  },

  async delete(roomId: string): Promise<void> {
    await db
      .delete(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.room_id, roomId));

    // Invalidate cache when deleting character mapping
    await cache.del(CacheKeys.eliza.roomCharacter(roomId));
  },
};
