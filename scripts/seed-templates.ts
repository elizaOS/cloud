#!/usr/bin/env tsx
/**
 * Seed/Update Template Characters from JSON files
 * This script reads template JSON files and upserts them to the database
 * Use this to sync database with latest template changes
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq } from "drizzle-orm";
import { marketplaceCache } from "../lib/cache/marketplace-cache";
import { getAllTemplates } from "../lib/characters/template-loader";

async function seedTemplates() {
  console.log("🌱 Template Character Seeding Started\n");

  try {
    // Get first user and org (templates belong to system)
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.error("❌ No user or organization found.");
      console.log("💡 Create a user account first by signing up.\n");
      process.exit(1);
    }

    console.log(`✓ User: ${firstUser.email}`);
    console.log(`✓ Organization: ${firstOrg.id}\n`);

    // Load templates from JSON files (source of truth)
    const templates = getAllTemplates();
    console.log(`📝 Loading ${templates.length} templates from JSON files...\n`);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const template of templates) {
      try {
        // Check if template already exists in database
        const existing = await db.query.userCharacters.findMany({
          where: eq(userCharacters.name, template.name),
        });

        const templateData = {
          organization_id: firstOrg.id,
          user_id: firstUser.id,
          name: template.name,
          username: template.username || null,
          bio: template.bio,
          system: template.system || null,
          topics: template.topics || [],
          adjectives: template.adjectives || [],
          plugins: template.plugins || [],
          category: template.category as string,
          tags: (template.tags as string[]) || [],
          is_template: true,
          is_public: true,
          featured: template.featured || false,
          avatar_url: template.avatarUrl,
          style: template.style || {},
          message_examples: (template.messageExamples || []) as any,
          post_examples: (template.postExamples || []) as string[],
          settings: template.settings || {},
          secrets: {},
          character_data: {
            name: template.name,
            bio: template.bio,
            topics: template.topics,
            adjectives: template.adjectives,
          } as any,
        };

        if (existing.length > 0) {
          // Update existing character
          await db
            .update(userCharacters)
            .set({
              ...templateData,
              updated_at: new Date(),
            })
            .where(eq(userCharacters.id, existing[0].id));

          console.log(
            `  ↻ Updated: ${template.name} (${template.category})${template.featured ? " ⭐" : ""}`
          );
          updatedCount++;
        } else {
          // Create new character
          await db.insert(userCharacters).values({
            ...templateData,
            view_count: Math.floor(Math.random() * 100) + 10,
            interaction_count: Math.floor(Math.random() * 50) + 5,
            popularity_score: template.featured
              ? 9000 + Math.floor(Math.random() * 1000)
              : Math.floor(Math.random() * 1000) + 100,
          });

          console.log(
            `  ✓ Created: ${template.name} (${template.category})${template.featured ? " ⭐" : ""}`
          );
          createdCount++;
        }
      } catch (error) {
        console.error(`  ✗ Failed: ${template.name}`, error);
        skippedCount++;
      }
    }

    console.log(`\n✅ Seeding Complete!`);
    console.log(`   Created: ${createdCount}`);
    console.log(`   Updated: ${updatedCount}`);
    if (skippedCount > 0) {
      console.log(`   Skipped: ${skippedCount}`);
    }

    if (createdCount > 0 || updatedCount > 0) {
      console.log(`\n🔄 Invalidating caches...`);
      await marketplaceCache.invalidateAll(firstOrg.id);
      console.log(`✓ Cache cleared`);
    }

    console.log(`\n🎉 Template characters are synced!\n`);
  } catch (error) {
    console.error("\n❌ Seeding Error:", error);
    process.exit(1);
  }
}

seedTemplates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
