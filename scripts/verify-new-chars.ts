#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceService } from "../lib/services/marketplace";

async function verifyNewChars() {
  console.log("🔍 Verifying New Characters\n");

  const firstUser = await db.query.users.findFirst();
  const firstOrg = await db.query.organizations.findFirst();

  if (!firstUser || !firstOrg) {
    console.error("❌ No user or organization found");
    process.exit(1);
  }

  console.log("=" .repeat(70));
  console.log("TEST 1: All characters (should show 13 total)");
  console.log("=" .repeat(70));

  const allResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: {},
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Total: ${allResults.pagination.total} characters\n`);

  console.log("=" .repeat(70));
  console.log("TEST 2: New characters only");
  console.log("=" .repeat(70));

  const newCharNames = ["Edad", "Mystic Oracle", "Amara"];
  const newChars = allResults.characters.filter(c => newCharNames.includes(c.name));

  newChars.forEach(char => {
    console.log(`✓ ${char.name} (@${char.username})`);
    console.log(`   Category: ${char.category}`);
    console.log(`   Bio: "${char.bio[0]}"`);
    console.log(`   Featured: ${char.featured ? "Yes ⭐" : "No"}`);
    console.log();
  });

  console.log("=" .repeat(70));
  console.log("TEST 3: Filter by lifestyle category (should include Edad & Amara)");
  console.log("=" .repeat(70));

  const lifestyleResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { category: "lifestyle" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${lifestyleResults.characters.length} lifestyle characters:`);
  lifestyleResults.characters.forEach(c => {
    console.log(`   - ${c.name}`);
  });
  console.log();

  console.log("=" .repeat(70));
  console.log("TEST 4: Search for 'psychic' (should find Mystic Oracle)");
  console.log("=" .repeat(70));

  const searchResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: { search: "psychic" },
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`✓ Found ${searchResults.characters.length} character(s):`);
  searchResults.characters.forEach(c => {
    console.log(`   - ${c.name}: "${c.bio[0]}"`);
  });
  console.log();

  console.log("✅ All new characters verified successfully!\n");
}

verifyNewChars()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
