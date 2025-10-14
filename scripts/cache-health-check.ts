// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { CacheHealth } from "@/lib/cache/health";
import { logger } from "@/lib/utils/logger";

async function healthCheck() {
  logger.info("[Cache Health] Running cache health check");

  const result = await CacheHealth.check();

  if (result.healthy) {
    logger.info(
      `[Cache Health] ✓ Cache is healthy (latency: ${result.latency}ms)`,
    );
    process.exit(0);
  } else {
    logger.error(
      `[Cache Health] ✗ Cache is unhealthy: ${result.error} (latency: ${result.latency}ms)`,
    );
    process.exit(1);
  }
}

healthCheck().catch((error) => {
  logger.error("[Cache Health] Error running health check:", error);
  process.exit(1);
});
