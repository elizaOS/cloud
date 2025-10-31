import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { memoryCache } from "@/lib/cache/memory-cache";

export class CacheInvalidation {
  static async onCreditMutation(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Credit mutation for org=${organizationId}`
    );

    await Promise.all([
      cache.del(CacheKeys.org.credits(organizationId)),
      cache.del(CacheKeys.org.data(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
      // Invalidate Eliza org balance cache on credit changes
      cache.del(CacheKeys.eliza.orgBalance(organizationId)),
    ]);
  }

  static async onUsageRecordCreated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Usage record created for org=${organizationId}`
    );

    await Promise.all([
      cache.delPattern(CacheKeys.analytics.pattern(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
    ]);
  }

  static async onGenerationCreated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Generation created for org=${organizationId}`
    );

    await cache.del(CacheKeys.org.dashboard(organizationId));
  }

  static async onOrganizationUpdated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Organization updated for org=${organizationId}`
    );

    await Promise.all([
      cache.del(CacheKeys.org.data(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
    ]);
  }

  static async clearAll(organizationId: string): Promise<void> {
    logger.warn(
      `[Cache Invalidation] Clearing ALL cache for org=${organizationId}`
    );

    await Promise.all([
      cache.delPattern(CacheKeys.org.pattern(organizationId)),
      cache.delPattern(CacheKeys.analytics.pattern(organizationId)),
      memoryCache.invalidateOrganization(organizationId),
    ]);
  }

  static async onMemoryCreated(
    organizationId: string,
    roomId?: string
  ): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Memory created for org=${organizationId}, room=${roomId}`
    );

    if (roomId) {
      await memoryCache.invalidateRoom(roomId, organizationId);
    }
  }

  static async onMemoryDeleted(
    organizationId: string,
    memoryId: string
  ): Promise<void> {
    logger.debug(`[Cache Invalidation] Memory deleted: memoryId=${memoryId}`);

    await memoryCache.invalidateMemory(memoryId);
  }

  static async onConversationUpdated(conversationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Conversation updated: ${conversationId}`
    );

    await memoryCache.invalidateConversation(conversationId);
  }
}
