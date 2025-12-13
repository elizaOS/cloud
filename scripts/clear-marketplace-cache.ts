#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceCache } from "@/lib/cache/marketplace-cache";

async function clearCache() {
  console.log("🧹 Clearing marketplace cache...\n");

  try {
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstOrg) {
      console.error("❌ No organization found");
      process.exit(1);
    }

    console.log(`Organization: ${firstOrg.id}\n`);

    console.log("Invalidating marketplace cache...");
    await marketplaceCache.invalidateAll(firstOrg.id);

    console.log("\n✅ Cache cleared successfully!");
    console.log("The marketplace should now show the seeded characters.\n");

  } catch (error) {
    console.error("\n❌ Error clearing cache:", error);
    process.exit(1);
  }
}

clearCache()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
