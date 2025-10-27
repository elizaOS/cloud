#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharactersRepository } from "../db/repositories/user-characters";

async function testFilters() {
  console.log("🧪 Testing Category and Search Filters\n");

  const firstUser = await db.query.users.findFirst();
  const firstOrg = await db.query.organizations.findFirst();

  if (!firstUser || !firstOrg) {
    console.error("❌ No user or organization found");
    process.exit(1);
  }

  console.log(`Testing with user: ${firstUser.email}\n`);

  console.log("=" .repeat(60));
  console.log("TEST 1: No filters (should return all characters)");
  console.log("=" .repeat(60));

  const allChars = await userCharactersRepository.search(
    {},
    firstUser.id,
    firstOrg.id,
    { sortBy: "popularity", order: "desc" },
    50,
    0
  );
  console.log(`✓ Found ${allChars.length} total characters\n`);

  console.log("=" .repeat(60));
  console.log("TEST 2: Filter by category = 'entertainment'");
  console.log("=" .repeat(60));

  const entertainmentChars = await userCharactersRepository.search(
    { category: "entertainment" },
    firstUser.id,
    firstOrg.id,
    { sortBy: "popularity", order: "desc" },
    50,
    0
  );
  console.log(`✓ Found ${entertainmentChars.length} entertainment characters`);
  entertainmentChars.forEach((char) => {
    console.log(`  - ${char.name} (category: ${char.category})`);
  });
  console.log();

  console.log("=" .repeat(60));
  console.log("TEST 3: Search query = 'Luna'");
  console.log("=" .repeat(60));

  const searchChars = await userCharactersRepository.search(
    { search: "Luna" },
    firstUser.id,
    firstOrg.id,
    { sortBy: "popularity", order: "desc" },
    50,
    0
  );
  console.log(`✓ Found ${searchChars.length} characters matching 'Luna'`);
  searchChars.forEach((char) => {
    console.log(`  - ${char.name}`);
  });
  console.log();

  console.log("=" .repeat(60));
  console.log("TEST 4: Category = 'health' + Search = 'wellness'");
  console.log("=" .repeat(60));

  const combinedChars = await userCharactersRepository.search(
    { category: "health", search: "wellness" },
    firstUser.id,
    firstOrg.id,
    { sortBy: "popularity", order: "desc" },
    50,
    0
  );
  console.log(`✓ Found ${combinedChars.length} health characters matching 'wellness'`);
  combinedChars.forEach((char) => {
    console.log(`  - ${char.name} (category: ${char.category})`);
  });
  console.log();

  console.log("✅ All filter tests completed!\n");
}

testFilters()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
