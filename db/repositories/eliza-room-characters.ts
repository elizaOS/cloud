import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  elizaRoomCharactersTable,
  type ElizaRoomCharacter,
  type NewElizaRoomCharacter,
} from "../schemas";

export const elizaRoomCharactersRepository = {
  async findByRoomId(roomId: string): Promise<ElizaRoomCharacter | undefined> {
    const result = await db
      .select()
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.room_id, roomId))
      .limit(1);

    return result[0];
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

    return result[0];
  },

  async delete(roomId: string): Promise<void> {
    await db
      .delete(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.room_id, roomId));
  },
};
