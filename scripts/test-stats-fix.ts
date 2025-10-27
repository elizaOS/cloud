#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceService } from "../lib/services/marketplace";

async function testStatsFix() {
  console.log("🧪 Testing Stats Fix\n");

  try {
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.error("❌ No user or organization found");
      process.exit(1);
    }

    console.log(`✓ User: ${firstUser.email}`);
    console.log(`✓ Organization: ${firstOrg.id}\n`);

    console.log("=" .repeat(60));
    console.log("TEST 1: Search WITHOUT stats (includeStats: false)");
    console.log("=" .repeat(60));
    console.log("This should work fast without errors...\n");

    const resultWithoutStats = await marketplaceService.searchCharacters({
      userId: firstUser.id,
      organizationId: firstOrg.id,
      filters: {},
      sortOptions: { sortBy: "popularity", order: "desc" },
      pagination: { page: 1, limit: 20 },
      includeStats: false,
    });

    console.log(`✓ Found ${resultWithoutStats.characters.length} characters`);
    console.log(`✓ Total: ${resultWithoutStats.pagination.total}`);
    resultWithoutStats.characters.slice(0, 3).forEach((char, i) => {
      console.log(`  ${i + 1}. ${char.name} - stats: ${char.stats ? 'included' : 'not included'}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("TEST 2: Search WITH stats (includeStats: true)");
    console.log("=" .repeat(60));
    console.log("This should handle undefined gracefully and not crash...\n");

    const resultWithStats = await marketplaceService.searchCharacters({
      userId: firstUser.id,
      organizationId: firstOrg.id,
      filters: {},
      sortOptions: { sortBy: "popularity", order: "desc" },
      pagination: { page: 1, limit: 3 },
      includeStats: true,
    });

    console.log(`✓ Found ${resultWithStats.characters.length} characters`);
    console.log(`✓ No errors thrown!`);
    resultWithStats.characters.forEach((char, i) => {
      console.log(`  ${i + 1}. ${char.name}`);
      console.log(`     - stats included: ${!!char.stats}`);
      if (char.stats) {
        console.log(`     - messageCount: ${char.stats.messageCount}`);
        console.log(`     - status: ${char.stats.deploymentStatus}`);
      }
    });

    console.log("\n✅ All tests passed! Stats errors are handled gracefully.\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

testStatsFix()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
