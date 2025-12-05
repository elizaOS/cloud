import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { agentStateCache } from "@/lib/cache/agent-state-cache";
import { marketplaceCache } from "@/lib/cache/marketplace-cache";

/**
 * Invalidate all character-related caches
 * This should be called whenever character data is updated (e.g., MCP settings changed)
 * @param characterId - The character ID to invalidate
 */
export async function invalidateCharacterCache(
  characterId: string,
): Promise<void> {
  logger.debug(
    `[Character Cache] Invalidating all caches for character ${characterId}`,
  );

  await Promise.all([
    // Invalidate agent character data cache
    agentStateCache.invalidateCharacterData(characterId),

    // Invalidate marketplace character cache
    marketplaceCache.invalidateCharacter(characterId),

    // Invalidate room-character mappings (rooms using this character)
    // Note: We can't easily know all rooms for a character without a DB query,
    // so we'd need to invalidate based on pattern if this becomes critical
    // For now, room caches have shorter TTLs (10 minutes) and will refresh naturally
  ]);

  logger.info(
    `[Character Cache] Successfully invalidated caches for character ${characterId}`,
  );
}

/**
 * Invalidate character cache and all associated room caches
 * Use this when you know the specific rooms affected
 * @param characterId - The character ID to invalidate
 * @param roomIds - Optional list of room IDs using this character
 */
export async function invalidateCharacterAndRooms(
  characterId: string,
  roomIds?: string[],
): Promise<void> {
  logger.debug(
    `[Character Cache] Invalidating character ${characterId} and ${roomIds?.length || 0} rooms`,
  );

  const promises: Promise<unknown>[] = [
    // Invalidate the character itself
    invalidateCharacterCache(characterId),
  ];

  // Invalidate specific room caches if provided
  if (roomIds && roomIds.length > 0) {
    for (const roomId of roomIds) {
      promises.push(
        cache.del(CacheKeys.eliza.roomCharacter(roomId)),
        cache.del(CacheKeys.agent.roomContext(roomId)),
      );
    }
  }

  await Promise.all(promises);
}
