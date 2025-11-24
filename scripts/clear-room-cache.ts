/**
 * Clear cache for a specific room
 */

import { config } from "dotenv";
import { cache } from "../lib/cache/client";
import { CacheKeys } from "../lib/cache/keys";

config({ path: ".env.local" });

const roomId = process.argv[2] || "4282cf1c-1515-455e-9ce5-c4299c5e4f5f";

async function clearRoomCache() {
  console.log("🔧 Clearing cache for room:", roomId);
  
  try {
    const key = CacheKeys.eliza.roomCharacter(roomId);
    console.log("Cache key:", key);
    
    await cache.del(key);
    console.log("✅ Cache cleared successfully!");
  } catch (error) {
    console.error("❌ Error clearing cache:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

clearRoomCache();

