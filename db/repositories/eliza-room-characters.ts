import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import {
  elizaRoomCharactersTable,
  type ElizaRoomCharacter,
  type NewElizaRoomCharacter,
} from "../schemas";

export const elizaRoomCharactersRepository = {
  async findByRoomId(roomId: string): Promise<ElizaRoomCharacter | undefined> {
    // DISABLED: Caching causes stale data in Vercel serverless (isolated container caches)
    // ALWAYS fetch from DB - character mapping lookups are fast (~5ms)
    console.log(
      `[RoomCharRepo] findByRoomId(${roomId.substring(0, 8)}...) - fetching from DB (cache disabled)`,
    );

    const result = await db
      .select()
      .from(elizaRoomCharactersTable)
      .where(eq(elizaRoomCharactersTable.room_id, roomId))
      .limit(1);

    const character = result[0];
    console.log(
      `[RoomCharRepo] DB result - characterId:`,
      character?.character_id || "none",
    );

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

  /**
   * Find affiliate characters that a user has interacted with (via rooms) 
   * but are still owned by anonymous/affiliate users.
   * These are claimable by the user.
   */
  async findClaimableAffiliateCharacters(userId: string): Promise<Array<{
    characterId: string;
    characterName: string;
    ownerId: string;
    roomId: string;
  }>> {
    const results = await db.execute<{
      character_id: string;
      character_name: string;
      owner_id: string;
      room_id: string;
    }>(sql`
      SELECT DISTINCT 
        rc.character_id,
        c.name as character_name,
        c.user_id as owner_id,
        rc.room_id
      FROM eliza_room_characters rc
      JOIN user_characters c ON rc.character_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE rc.user_id = ${userId}
        AND c.user_id != ${userId}
        AND (
          u.is_anonymous = true 
          OR (u.email LIKE 'affiliate-%@anonymous.elizacloud.ai' AND u.privy_user_id IS NULL)
        )
    `);

    return results.rows.map(r => ({
      characterId: r.character_id,
      characterName: r.character_name,
      ownerId: r.owner_id,
      roomId: r.room_id,
    }));
  },
};
