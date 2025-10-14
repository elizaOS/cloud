import { cache } from "./client";
import { logger } from "@/lib/utils/logger";

export class CacheHealth {
  static async check(): Promise<{
    healthy: boolean;
    latency: number | null;
    error: string | null;
  }> {
    try {
      const testKey = "health:check:ping";
      const testValue = { timestamp: Date.now(), ping: "pong" };

      const start = Date.now();

      await cache.set(testKey, testValue, 10);
      const retrieved = await cache.get<typeof testValue>(testKey);
      await cache.del(testKey);

      const latency = Date.now() - start;

      if (!retrieved || retrieved.ping !== "pong") {
        return {
          healthy: false,
          latency,
          error: "Cache roundtrip failed",
        };
      }

      return {
        healthy: true,
        latency,
        error: null,
      };
    } catch (error) {
      logger.error("[Cache Health] Health check failed:", error);
      return {
        healthy: false,
        latency: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  static async clearPattern(pattern: string): Promise<number> {
    try {
      logger.info(`[Cache Health] Clearing pattern: ${pattern}`);
      await cache.delPattern(pattern);
      return 0;
    } catch (error) {
      logger.error(`[Cache Health] Error clearing pattern ${pattern}:`, error);
      return -1;
    }
  }

  static async clearCorruptedEntries(organizationId: string): Promise<void> {
    logger.info(
      `[Cache Health] Clearing potentially corrupted cache for org=${organizationId}`,
    );
    await this.clearPattern(`org:${organizationId}:*`);
    await this.clearPattern(`analytics:*:${organizationId}:*`);
  }
}
