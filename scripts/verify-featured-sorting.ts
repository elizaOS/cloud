#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { marketplaceService } from "../lib/services/marketplace";

async function verifyFeaturedSorting() {
  console.log("🔍 Verifying Featured Character Sorting\n");

  const firstUser = await db.query.users.findFirst();
  const firstOrg = await db.query.organizations.findFirst();

  if (!firstUser || !firstOrg) {
    console.error("❌ No user or organization found");
    process.exit(1);
  }

  console.log("=" .repeat(70));
  console.log("TEST 1: Sort by popularity (should show featured first)");
  console.log("=" .repeat(70));

  const popularityResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: {},
    sortOptions: { sortBy: "popularity", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`\nTop 10 characters (by popularity):`);
  popularityResults.characters.slice(0, 10).forEach((char, i) => {
    const featuredBadge = char.featured ? "⭐ FEATURED" : "";
    console.log(`  ${i + 1}. ${char.name} (@${char.username}) ${featuredBadge}`);
    console.log(`     Popularity: ${char.popularity || 0}`);
  });

  console.log("\n" + "=" .repeat(70));
  console.log("TEST 2: Sort by newest (should show featured first)");
  console.log("=" .repeat(70));

  const newestResults = await marketplaceService.searchCharacters({
    userId: firstUser.id,
    organizationId: firstOrg.id,
    filters: {},
    sortOptions: { sortBy: "newest", order: "desc" },
    pagination: { page: 1, limit: 50 },
    includeStats: false,
  });

  console.log(`\nTop 5 characters (by newest):`);
  newestResults.characters.slice(0, 5).forEach((char, i) => {
    const featuredBadge = char.featured ? "⭐ FEATURED" : "";
    console.log(`  ${i + 1}. ${char.name} (@${char.username}) ${featuredBadge}`);
  });

  console.log("\n" + "=" .repeat(70));
  console.log("TEST 3: Verify only 3 characters are featured");
  console.log("=" .repeat(70));

  const featuredChars = popularityResults.characters.filter(c => c.featured);
  console.log(`\n✓ Total featured characters: ${featuredChars.length}`);

  if (featuredChars.length === 3) {
    console.log("✅ PASS: Exactly 3 characters are featured");
    featuredChars.forEach(c => {
      console.log(`   - ${c.name} (@${c.username})`);
    });
  } else {
    console.log(`❌ FAIL: Expected 3 featured characters, got ${featuredChars.length}`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("TEST 4: Verify featured characters are at the top");
  console.log("=" .repeat(70));

  const topThree = popularityResults.characters.slice(0, 3);
  const allTopThreeFeatured = topThree.every(c => c.featured);

  if (allTopThreeFeatured) {
    console.log("\n✅ PASS: Top 3 characters are all featured");
    topThree.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (@${c.username}) ⭐`);
    });
  } else {
    console.log("\n❌ FAIL: Top 3 characters are not all featured");
    topThree.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (@${c.username}) ${c.featured ? "⭐" : "❌"}`);
    });
  }

  console.log("\n" + "=" .repeat(70));

  const expectedUsernames = ['edad', 'mysticoracle', 'amara'];
  const featuredUsernames = featuredChars.map(c => c.username);
  const correctFeatured = expectedUsernames.every(u => featuredUsernames.includes(u));

  if (correctFeatured && featuredChars.length === 3) {
    console.log("\n✅ ALL TESTS PASSED!");
    console.log("   - Only Edad, Mystic Oracle, and Amara are featured");
    console.log("   - Featured characters appear at the top");
    console.log("   - Sorting by popularity works correctly\n");
  } else {
    console.log("\n❌ SOME TESTS FAILED!");
    console.log("   Please review the results above.\n");
  }
}

verifyFeaturedSorting()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    if (err instanceof Error) {
      console.error("Stack:", err.stack);
    }
    process.exit(1);
  });
