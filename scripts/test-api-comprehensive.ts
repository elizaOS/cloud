#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharactersRepository } from "../db/repositories/user-characters";
import { marketplaceService } from "../lib/services/marketplace";

async function testComprehensive() {
  console.log("🔍 Comprehensive Marketplace API Test\n");

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
    console.log("TEST 1: Repository Direct Query (NO filters)");
    console.log("=" .repeat(60));
    const repoResult = await userCharactersRepository.search(
      {},
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${repoResult.length} characters`);
    repoResult.forEach((char, i) => {
      console.log(`  ${i + 1}. ${char.name} - org: ${char.organization_id}, template: ${char.is_template}, public: ${char.is_public}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("TEST 2: MarketplaceService (NO filters)");
    console.log("=".repeat(60));
    const serviceResult = await marketplaceService.searchCharacters({
      userId: firstUser.id,
      organizationId: firstOrg.id,
      filters: {},
      sortOptions: { sortBy: "popularity", order: "desc" },
      pagination: { page: 1, limit: 20 },
      includeStats: false,
    });
    console.log(`✓ Found ${serviceResult.characters.length} characters`);
    console.log(`✓ Total: ${serviceResult.pagination.total}`);
    console.log(`✓ Has more: ${serviceResult.pagination.hasMore}`);
    serviceResult.characters.forEach((char, i) => {
      console.log(`  ${i + 1}. ${char.name}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("TEST 3: MarketplaceService with includeStats=true");
    console.log("=".repeat(60));
    const serviceWithStats = await marketplaceService.searchCharacters({
      userId: firstUser.id,
      organizationId: firstOrg.id,
      filters: {},
      sortOptions: { sortBy: "popularity", order: "desc" },
      pagination: { page: 1, limit: 20 },
      includeStats: true,
    });
    console.log(`✓ Found ${serviceWithStats.characters.length} characters`);
    console.log(`✓ Total: ${serviceWithStats.pagination.total}`);

    console.log("\n" + "=".repeat(60));
    console.log("TEST 4: Repository with template=true filter");
    console.log("=".repeat(60));
    const templateResult = await userCharactersRepository.search(
      { template: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${templateResult.length} template characters`);

    console.log("\n" + "=".repeat(60));
    console.log("TEST 5: Repository with public=true filter");
    console.log("=".repeat(60));
    const publicResult = await userCharactersRepository.search(
      { public: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${publicResult.length} public characters`);

    console.log("\n" + "=".repeat(60));
    console.log("TEST 6: Repository with featured=true filter");
    console.log("=".repeat(60));
    const featuredResult = await userCharactersRepository.search(
      { featured: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${featuredResult.length} featured characters`);

    console.log("\n" + "=".repeat(60));
    console.log("TEST 7: Repository with myCharacters=true filter");
    console.log("=".repeat(60));
    const myCharsResult = await userCharactersRepository.search(
      { myCharacters: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${myCharsResult.length} my characters`);
    myCharsResult.forEach((char, i) => {
      console.log(`  ${i + 1}. ${char.name} - user_id: ${char.user_id} (expected: ${firstUser.id})`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("TEST 8: Repository with deployed=true filter");
    console.log("=".repeat(60));
    const deployedResult = await userCharactersRepository.search(
      { deployed: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`✓ Found ${deployedResult.length} deployed characters`);

    console.log("\n" + "=".repeat(60));
    console.log("TEST 9: Check what filters block results");
    console.log("=".repeat(60));

    const filterTests = [
      { name: "No filters", filters: {} },
      { name: "template=false", filters: { template: false } },
      { name: "public=false", filters: { public: false } },
      { name: "featured=false", filters: { featured: false } },
      { name: "myCharacters=false", filters: { myCharacters: false } },
      { name: "hasVoice=true", filters: { hasVoice: true } },
      { name: "deployed=false", filters: { deployed: false } },
    ];

    for (const test of filterTests) {
      const result = await userCharactersRepository.search(
        test.filters as any,
        firstUser.id,
        firstOrg.id,
        { sortBy: "popularity", order: "desc" },
        20,
        0
      );
      console.log(`  ${test.name.padEnd(25)} → ${result.length} characters`);
    }

    console.log("\n✅ All tests completed!\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

testComprehensive()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
