import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import type { Memory, UUID } from "@elizaos/core";

export interface MemoryRoomContext {
  roomId: string;
  messages: Memory[];
  participants: UUID[];
  metadata: Record<string, unknown>;
  depth: number;
  timestamp: Date;
}

export interface ConversationContext {
  conversationId: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    tokens?: number;
    cost?: number;
    createdAt: Date;
  }>;
  totalTokens: number;
  totalCost: number;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  context?: Memory[];
}

export class MemoryCache {
  async cacheMemory(
    key: string,
    memory: Memory,
    ttl: number,
  ): Promise<void> {
    try {
      await cache.set(key, memory, ttl);
      logger.debug(`[Memory Cache] Cached memory: ${key}`);
    } catch (error) {
      logger.error(`[Memory Cache] Failed to cache memory ${key}:`, error);
    }
  }

  async getMemory(key: string): Promise<Memory | null> {
    try {
      const memory = await cache.get<Memory>(key);
      if (memory) {
        logger.debug(`[Memory Cache] HIT: ${key}`);
      } else {
        logger.debug(`[Memory Cache] MISS: ${key}`);
      }
      return memory;
    } catch (error) {
      logger.error(`[Memory Cache] Error getting memory ${key}:`, error);
      return null;
    }
  }

  async invalidateMemory(memoryId: string): Promise<void> {
    try {
      const pattern = `memory:*:${memoryId}:*`;
      await cache.delPattern(pattern);
      logger.debug(`[Memory Cache] Invalidated memory pattern: ${pattern}`);
    } catch (error) {
      logger.error(
        `[Memory Cache] Error invalidating memory ${memoryId}:`,
        error,
      );
    }
  }

  // SECURITY FIX: Add organization ID to all cache methods to prevent key collisions
  async cacheRoomContext(
    roomId: string,
    organizationId: string,
    context: MemoryRoomContext,
    ttl: number,
  ): Promise<void> {
    try {
      const key = `memory:${organizationId}:room:${roomId}:context:${context.depth}:v1`;
      await cache.set(
        key,
        {
          ...context,
          timestamp: context.timestamp.toISOString(),
        },
        ttl,
      );
      logger.debug(`[Memory Cache] Cached room context: ${key}`);
    } catch (error) {
      logger.error(
        `[Memory Cache] Failed to cache room context ${roomId}:`,
        error,
      );
    }
  }

  async getRoomContext(
    roomId: string,
    organizationId: string,
  ): Promise<MemoryRoomContext | null> {
    try {
      const keys = await this.getRoomContextKeys(roomId, organizationId);
      for (const key of keys) {
        const cached = await cache.get<MemoryRoomContext & { timestamp: string }>(
          key,
        );
        if (cached) {
          logger.debug(`[Memory Cache] Room context HIT: ${key}`);
          return {
            ...cached,
            timestamp: new Date(cached.timestamp),
          };
        }
      }
      logger.debug(`[Memory Cache] Room context MISS: ${roomId}`);
      return null;
    } catch (error) {
      logger.error(
        `[Memory Cache] Error getting room context ${roomId}:`,
        error,
      );
      return null;
    }
  }

  async invalidateRoom(
    roomId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const pattern = `memory:${organizationId}:room:${roomId}:*`;
      await cache.delPattern(pattern);
      logger.debug(`[Memory Cache] Invalidated room pattern: ${pattern}`);
    } catch (error) {
      logger.error(`[Memory Cache] Error invalidating room ${roomId}:`, error);
    }
  }

  async cacheConversationContext(
    conversationId: string,
    context: ConversationContext,
    ttl: number,
  ): Promise<void> {
    try {
      const key = `memory:conv:${conversationId}:context:v1`;
      await cache.set(
        key,
        {
          ...context,
          messages: context.messages.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          })),
        },
        ttl,
      );
      logger.debug(`[Memory Cache] Cached conversation context: ${key}`);
    } catch (error) {
      logger.error(
        `[Memory Cache] Failed to cache conversation context ${conversationId}:`,
        error,
      );
    }
  }

  async getConversationContext(
    conversationId: string,
  ): Promise<ConversationContext | null> {
    try {
      const key = `memory:conv:${conversationId}:context:v1`;
      const cached = await cache.get<
        ConversationContext & {
          messages: Array<
            ConversationContext["messages"][0] & { createdAt: string }
          >;
        }
      >(key);
      if (cached) {
        logger.debug(`[Memory Cache] Conversation context HIT: ${key}`);
        return {
          ...cached,
          messages: cached.messages.map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })),
        };
      }
      logger.debug(`[Memory Cache] Conversation context MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(
        `[Memory Cache] Error getting conversation context ${conversationId}:`,
        error,
      );
      return null;
    }
  }

  async cacheMemories(memories: Map<string, Memory>): Promise<void> {
    try {
      const promises: Promise<void>[] = [];
      for (const [key, memory] of memories) {
        promises.push(cache.set(key, memory, CacheTTL.memory.item));
      }
      await Promise.all(promises);
      logger.debug(
        `[Memory Cache] Bulk cached ${memories.size} memories`,
      );
    } catch (error) {
      logger.error("[Memory Cache] Error bulk caching memories:", error);
    }
  }

  async getMemories(keys: string[]): Promise<Map<string, Memory>> {
    try {
      const values = await cache.mget<Memory>(keys);
      const result = new Map<string, Memory>();

      values.forEach((value, index) => {
        if (value !== null) {
          result.set(keys[index], value);
        }
      });

      logger.debug(
        `[Memory Cache] Bulk retrieved ${result.size}/${keys.length} memories`,
      );
      return result;
    } catch (error) {
      logger.error("[Memory Cache] Error bulk getting memories:", error);
      return new Map();
    }
  }

  async cacheSearchResults(
    queryHash: string,
    results: SearchResult[],
    ttl: number,
  ): Promise<void> {
    try {
      const key = `memory:search:${queryHash}:v1`;
      await cache.set(key, results, ttl);
      logger.debug(
        `[Memory Cache] Cached search results: ${key} (${results.length} results)`,
      );
    } catch (error) {
      logger.error(
        `[Memory Cache] Failed to cache search results ${queryHash}:`,
        error,
      );
    }
  }

  async getSearchResults(queryHash: string): Promise<SearchResult[] | null> {
    try {
      const key = `memory:search:${queryHash}:v1`;
      const results = await cache.get<SearchResult[]>(key);
      if (results) {
        logger.debug(`[Memory Cache] Search results HIT: ${key}`);
      } else {
        logger.debug(`[Memory Cache] Search results MISS: ${key}`);
      }
      return results;
    } catch (error) {
      logger.error(
        `[Memory Cache] Error getting search results ${queryHash}:`,
        error,
      );
      return null;
    }
  }

  async invalidateOrganization(orgId: string): Promise<void> {
    try {
      const pattern = CacheKeys.memory.orgPattern(orgId);
      await cache.delPattern(pattern);
      logger.info(`[Memory Cache] Invalidated organization: ${orgId}`);
    } catch (error) {
      logger.error(
        `[Memory Cache] Error invalidating organization ${orgId}:`,
        error,
      );
    }
  }

  async invalidateConversation(conversationId: string): Promise<void> {
    try {
      const pattern = `memory:*:conv:${conversationId}:*`;
      await cache.delPattern(pattern);
      logger.debug(
        `[Memory Cache] Invalidated conversation pattern: ${pattern}`,
      );
    } catch (error) {
      logger.error(
        `[Memory Cache] Error invalidating conversation ${conversationId}:`,
        error,
      );
    }
  }

  private async getRoomContextKeys(
    roomId: string,
    organizationId: string,
  ): Promise<string[]> {
    return [
      `memory:${organizationId}:room:${roomId}:context:20:v1`,
      `memory:${organizationId}:room:${roomId}:context:50:v1`,
      `memory:${organizationId}:room:${roomId}:context:100:v1`,
    ];
  }
}

export const memoryCache = new MemoryCache();
