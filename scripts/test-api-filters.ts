#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceService } from "../lib/services/marketplace";

async function testAPIFilters() {
  console.log("🧪 Testing Marketplace Service API Filters\n");

  const firstUser = await db.query.users.findFirst();
  const firstOrg = await db.query.organizations.findFirst();

  if (!firstUser || !firstOrg) {
    console.error("❌ No user or organization found");
    process.exit(1);
  }

  console.log(`Testing with user: ${firstUser.email}`);
  console.log(`Organization: ${firstOrg.id}\n`);

  console.log("=" .repeat(70));
  console.log("TEST 1: No filters - should return all characters");
  console.log("=" .repeat(70));

  const allResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: {},
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${allResults.characters.length} characters`);
  console.log(`  Total: ${allResults.pagination.total}\n`);

  console.log("=" .repeat(70));
  console.log("TEST 2: Filter by category = 'entertainment'");
  console.log("=" .repeat(70));

  const entertainmentResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { category: "entertainment" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${entertainmentResults.characters.length} entertainment characters`);
  entertainmentResults.characters.forEach((char) => {
    console.log(`  - ${char.name} (${char.category})`);
  });
  console.log();

  console.log("=" .repeat(70));
  console.log("TEST 3: Filter by category = 'gaming'");
  console.log("=" .repeat(70));

  const gamingResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { category: "gaming" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${gamingResults.characters.length} gaming characters`);
  gamingResults.characters.forEach((char) => {
    console.log(`  - ${char.name} (${char.category})`);
  });
  console.log();

  console.log("=" .repeat(70));
  console.log("TEST 4: Search query = 'Luna'");
  console.log("=" .repeat(70));

  const searchResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { search: "Luna" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${searchResults.characters.length} characters matching 'Luna'`);
  searchResults.characters.forEach((char) => {
    console.log(`  - ${char.name}`);
  });
  console.log();

  console.log("=" .repeat(70));
  console.log("TEST 5: Search query = 'Bot'");
  console.log("=" .repeat(70));

  const botSearchResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { search: "Bot" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${botSearchResults.characters.length} characters matching 'Bot'`);
  botSearchResults.characters.forEach((char) => {
    console.log(`  - ${char.name}`);
  });
  console.log();

  console.log("=" .repeat(70));
  console.log("TEST 6: Category = 'lifestyle' + Search = 'wellness'");
  console.log("=" .repeat(70));

  const combinedResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { category: "lifestyle", search: "wellness" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${combinedResults.characters.length} lifestyle chars with 'wellness'`);
  combinedResults.characters.forEach((char) => {
    console.log(`  - ${char.name} (${char.category})`);
  });
  console.log();

  console.log("✅ All API filter tests completed successfully!\n");
}

testAPIFilters()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    if (err instanceof Error) {
      console.error("Stack:", err.stack);
    }
    process.exit(1);
  });
