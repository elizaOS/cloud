// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { cache } from "@/lib/cache/client";
import { CacheHealth } from "@/lib/cache/health";
import { logger } from "@/lib/utils/logger";

async function clearCache() {
  logger.info("[Clear Cache] Starting cache clear operation");

  const health = await CacheHealth.check();
  logger.info("[Clear Cache] Health check result:", health);

  if (!health.healthy) {
    logger.error("[Clear Cache] Cache is unhealthy, aborting");
    process.exit(1);
  }

  const pattern = process.argv[2] || "*";

  logger.info(`[Clear Cache] Clearing pattern: ${pattern}`);
  await cache.delPattern(pattern);

  logger.info("[Clear Cache] Cache cleared successfully");

  const finalHealth = await CacheHealth.check();
  logger.info("[Clear Cache] Final health check:", finalHealth);

  process.exit(0);
}

clearCache().catch((error) => {
  logger.error("[Clear Cache] Error:", error);
  process.exit(1);
});
