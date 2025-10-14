import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

export class CacheInvalidation {
  static async onCreditMutation(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Credit mutation for org=${organizationId}`,
    );

    await Promise.all([
      cache.del(CacheKeys.org.credits(organizationId)),
      cache.del(CacheKeys.org.data(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
    ]);
  }

  static async onUsageRecordCreated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Usage record created for org=${organizationId}`,
    );

    await Promise.all([
      cache.delPattern(CacheKeys.analytics.pattern(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
    ]);
  }

  static async onGenerationCreated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Generation created for org=${organizationId}`,
    );

    await cache.del(CacheKeys.org.dashboard(organizationId));
  }

  static async onOrganizationUpdated(organizationId: string): Promise<void> {
    logger.debug(
      `[Cache Invalidation] Organization updated for org=${organizationId}`,
    );

    await Promise.all([
      cache.del(CacheKeys.org.data(organizationId)),
      cache.del(CacheKeys.org.dashboard(organizationId)),
    ]);
  }

  static async clearAll(organizationId: string): Promise<void> {
    logger.warn(
      `[Cache Invalidation] Clearing ALL cache for org=${organizationId}`,
    );

    await Promise.all([
      cache.delPattern(CacheKeys.org.pattern(organizationId)),
      cache.delPattern(CacheKeys.analytics.pattern(organizationId)),
    ]);
  }
}
