import { cache } from "../lib/cache/client";
import { logger } from "../lib/utils/logger";

async function clearRoomContexts() {
  console.log("Clearing all agent:room:*:context:* keys...");
  
  try {
    await cache.delPattern("agent:room:*:context:*");
    console.log("✓ Successfully cleared all cached room contexts");
  } catch (error) {
    logger.error("Failed to clear room contexts:", error);
    process.exit(1);
  }
}

clearRoomContexts();
