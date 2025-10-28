#!/usr/bin/env tsx
/**
 * Update Avatar URLs in Database
 * Sets avatar_url for all template characters to use locally generated images
 */

import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq, and } from "drizzle-orm";
import { marketplaceCache } from "../lib/cache/marketplace-cache";

interface CharacterAvatarMapping {
  username: string;
  avatarFilename: string;
}

const AVATAR_MAPPINGS: CharacterAvatarMapping[] = [
  { username: "eliza", avatarFilename: "eliza.png" },
  { username: "codementor", avatarFilename: "codementor.png" },
  { username: "luna_anime", avatarFilename: "luna.png" },
  { username: "creativespark", avatarFilename: "creativespark.png" },
  { username: "gamemaster", avatarFilename: "gamemaster.png" },
  { username: "prof_ada", avatarFilename: "prof_ada.png" },
  { username: "comedybot", avatarFilename: "comedybot.png" },
  { username: "voiceai", avatarFilename: "voiceai.png" },
  { username: "historyscholar", avatarFilename: "historyscholar.png" },
  { username: "wellnesscoach", avatarFilename: "wellnesscoach.png" },
  { username: "edad", avatarFilename: "edad.png" },
  { username: "mysticoracle", avatarFilename: "mysticoracle.png" },
  { username: "amara", avatarFilename: "amara.png" },
];

async function updateAvatarUrls() {
  console.log("🖼️  Updating Avatar URLs in Database\n");

  try {
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstOrg) {
      console.error("❌ No organization found");
      process.exit(1);
    }

    console.log(`✓ Organization: ${firstOrg.id}\n`);

    console.log("📋 Checking avatar files...");
    const missingFiles: string[] = [];

    for (const mapping of AVATAR_MAPPINGS) {
      const filepath = resolve(__dirname, `../public/avatars/${mapping.avatarFilename}`);
      if (!existsSync(filepath)) {
        missingFiles.push(mapping.avatarFilename);
      }
    }

    if (missingFiles.length > 0) {
      console.error("\n❌ Missing avatar files:");
      missingFiles.forEach(file => console.error(`   - ${file}`));
      console.error("\n💡 Run 'bun scripts/generate-avatars.ts' first to generate all avatars.");
      process.exit(1);
    }

    console.log(`✓ All ${AVATAR_MAPPINGS.length} avatar files exist\n`);

    console.log("🔄 Updating database records...\n");

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const mapping of AVATAR_MAPPINGS) {
      const avatarUrl = `/avatars/${mapping.avatarFilename}`;

      try {
        const result = await db.update(userCharacters)
          .set({ avatar_url: avatarUrl })
          .where(
            and(
              eq(userCharacters.username, mapping.username),
              eq(userCharacters.is_template, true)
            )
          )
          .returning();

        if (result.length > 0) {
          console.log(`  ✅ ${result[0].name} (@${mapping.username})`);
          console.log(`     Avatar: ${avatarUrl}`);
          updatedCount++;
        } else {
          console.log(`  ⚠️  Character not found: @${mapping.username}`);
          notFoundCount++;
        }
      } catch (error) {
        console.error(`  ❌ Error updating @${mapping.username}:`, error);
      }
    }

    console.log("\n🧹 Clearing marketplace cache...");
    await marketplaceCache.invalidateAll(firstOrg.id);
    console.log("✓ Cache cleared");

    console.log("\n" + "=" .repeat(70));
    console.log("📊 Update Summary");
    console.log("=" .repeat(70));
    console.log(`✅ Successfully updated: ${updatedCount}`);
    console.log(`⚠️  Not found: ${notFoundCount}`);
    console.log(`📁 Total avatars: ${updatedCount}`);
    console.log();

    if (updatedCount === AVATAR_MAPPINGS.length) {
      console.log("🎉 All character avatars updated successfully!");
    } else {
      console.log(`⚠️  Only ${updatedCount}/${AVATAR_MAPPINGS.length} characters were updated.`);
    }

    console.log("\n📝 Next steps:");
    console.log("   1. Restart the server to clear any server-side caches");
    console.log("   2. Reload the marketplace page in your browser");
    console.log("   3. Verify all character avatars are displaying\n");

  } catch (error) {
    console.error("\n❌ Error updating avatar URLs:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

updateAvatarUrls()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
