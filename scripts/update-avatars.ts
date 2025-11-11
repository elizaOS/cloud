#!/usr/bin/env tsx
/**
 * Update Avatar URLs Script
 * Updates existing template characters with new avatar URLs
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq, and } from "drizzle-orm";
import { marketplaceCache } from "../lib/cache/marketplace-cache";
import { organizations } from "../db/schemas";

// Map of username to new avatar URL
const AVATAR_UPDATES: Record<string, string> = {
  eliza: "/avatars/eliza-chibi.png",
  codementor: "/avatars/codementor-toy.png",
  luna_anime: "/avatars/luna_anime-chibi.png",
  creativespark: "/avatars/creativespark-chibi.png",
  gamemaster: "/avatars/gamemaster-chibi.png",
  prof_ada: "/avatars/prof_ada-chibi.png",
  comedybot: "/avatars/comedybot-chibi.png",
  voiceai: "/avatars/voiceai-chibi.png",
  historyscholar: "/avatars/historyscholar-chibi.png",
  wellnesscoach: "/avatars/wellnesscoach-chibi.png",
  edad: "/avatars/edad-toy.png",
  mysticoracle: "/avatars/mysticoracle-chibi.png",
  amara: "/avatars/amara-toy.png",
};

async function updateAvatars() {
  console.log("🖼️  Updating character avatars...\n");

  try {
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstOrg) {
      console.error("❌ No organization found.");
      process.exit(1);
    }

    console.log(`✓ Organization: ${firstOrg.id}\n`);

    let successCount = 0;
    let notFoundCount = 0;

    for (const [username, avatarUrl] of Object.entries(AVATAR_UPDATES)) {
      try {
        // Find the template character by username
        const characters = await db.query.userCharacters.findMany({
          where: and(
            eq(userCharacters.username, username),
            eq(userCharacters.is_template, true)
          ),
        });

        if (characters.length === 0) {
          console.log(`  ⚠️  Not found: ${username}`);
          notFoundCount++;
          continue;
        }

        // Update the avatar URL
        for (const character of characters) {
          await db
            .update(userCharacters)
            .set({ avatar_url: avatarUrl })
            .where(eq(userCharacters.id, character.id));
        }

        console.log(`  ✓ ${username} → ${avatarUrl}`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed: ${username}`, error);
      }
    }

    console.log(`\n✅ Update Complete!`);
    console.log(
      `   Updated: ${successCount}/${Object.keys(AVATAR_UPDATES).length}`
    );
    if (notFoundCount > 0) {
      console.log(`   Not found: ${notFoundCount}`);
    }

    if (successCount > 0) {
      console.log(`\n🔄 Invalidating marketplace cache...`);
      await marketplaceCache.invalidateAll(firstOrg.id);
      console.log(`✓ Cache cleared`);
    }

    console.log(`\n🎉 Avatars updated!\n`);
  } catch (error) {
    console.error("\n❌ Update Error:", error);
    process.exit(1);
  }
}

updateAvatars()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
