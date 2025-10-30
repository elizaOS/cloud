#!/usr/bin/env tsx
/**
 * Update Featured Status Script
 * Makes only Edad, Mystic Oracle, and Amara featured
 * Unfeatures all other characters and boosts popularity scores for featured ones
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq, inArray, notInArray, and } from "drizzle-orm";
import { marketplaceCache } from "../lib/cache/marketplace-cache";

const FEATURED_USERNAMES = ['edad', 'mysticoracle', 'amara'];

async function updateFeaturedStatus() {
  console.log("🔄 Updating Featured Status for Characters\n");

  try {
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstOrg) {
      console.error("❌ No organization found");
      process.exit(1);
    }

    console.log(`✓ Organization: ${firstOrg.id}\n`);

    console.log("📊 Current state:");
    const allChars = await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_template, true),
    });

    const currentFeatured = allChars.filter(c => c.featured);
    console.log(`  Featured characters: ${currentFeatured.length}`);
    currentFeatured.forEach(c => {
      console.log(`    - ${c.name} (@${c.username})`);
    });

    console.log("\n🔨 Applying updates...\n");

    console.log("1. Unfeaturing all old characters...");
    const unfeaturedResult = await db.update(userCharacters)
      .set({ featured: false })
      .where(
        and(
          eq(userCharacters.is_template, true),
          notInArray(userCharacters.username, FEATURED_USERNAMES)
        )
      )
      .returning();

    console.log(`   ✓ Unfeatured ${unfeaturedResult.length} characters`);

    console.log("\n2. Featuring new characters with high popularity...");
    const featuredResult = await db.update(userCharacters)
      .set({
        featured: true,
        popularity_score: 9000 + Math.floor(Math.random() * 1000)
      })
      .where(
        and(
          eq(userCharacters.is_template, true),
          inArray(userCharacters.username, FEATURED_USERNAMES)
        )
      )
      .returning();

    console.log(`   ✓ Featured ${featuredResult.length} characters:`);
    featuredResult.forEach(c => {
      console.log(`     - ${c.name} (@${c.username}) - popularity: ${c.popularity_score}`);
    });

    console.log("\n3. Clearing marketplace cache...");
    await marketplaceCache.invalidateAll(firstOrg.id);
    console.log("   ✓ Cache cleared");

    console.log("\n📊 Final state:");
    const updatedChars = await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_template, true),
    });

    const newFeatured = updatedChars.filter(c => c.featured);
    console.log(`  Featured characters: ${newFeatured.length}`);
    newFeatured.forEach(c => {
      console.log(`    - ${c.name} (@${c.username}) ⭐`);
    });

    const nonFeatured = updatedChars.filter(c => !c.featured);
    console.log(`\n  Non-featured characters: ${nonFeatured.length}`);
    nonFeatured.forEach(c => {
      console.log(`    - ${c.name} (@${c.username})`);
    });

    console.log("\n✅ Featured status updated successfully!");
    console.log("🎉 Only Edad, Mystic Oracle, and Amara are now featured.\n");

  } catch (error) {
    console.error("\n❌ Error updating featured status:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

updateFeaturedStatus()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
