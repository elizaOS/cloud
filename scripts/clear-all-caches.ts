#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceCache } from "../lib/cache/marketplace-cache";
import { cache as cacheClient } from "../lib/cache/client";

async function clearAllCaches() {
  console.log("🧹 Clearing ALL caches...\n");

  try {
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstOrg) {
      console.error("❌ No organization found");
      process.exit(1);
    }

    console.log(`Organization: ${firstOrg.id}\n`);

    console.log("1. Clearing marketplace cache...");
    await marketplaceCache.invalidateAll(firstOrg.id);
    console.log("   ✓ Marketplace cache cleared");

    console.log("\n2. Clearing agent stats cache...");
    await cacheClient.delPattern("agent:stats:*");
    console.log("   ✓ Agent stats cache cleared");

    console.log("\n3. Clearing search result cache...");
    await cacheClient.delPattern("marketplace:search:*");
    console.log("   ✓ Search cache cleared");

    console.log("\n✅ All caches cleared successfully!");
    console.log("Restart the server and reload the page.\n");
  } catch (error) {
    console.error("\n❌ Error clearing caches:", error);
    process.exit(1);
  }
}

clearAllCaches()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
