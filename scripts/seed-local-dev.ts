#!/usr/bin/env tsx
/**
 * Seed Local Development Database
 * Called by db:local:setup to seed template characters
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { marketplaceCache } from "../lib/cache/marketplace-cache";
import { getAllTemplates } from "../lib/characters/template-loader";

async function seedLocalDev() {
  console.log("🌱 Seeding Local Development Database\n");

  try {
    // Get first user and org
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.log("⚠️  No user/org found - skipping template seeding");
      console.log("💡 Templates will be seeded after first user signup\n");
      return;
    }

    console.log(`✓ User: ${firstUser.email}`);
    console.log(`✓ Organization: ${firstOrg.id}\n`);

    // Check if templates already exist
    const existingCount = await db.$count(
      userCharacters,
      (t) => t.is_template === true
    );

    if (existingCount > 0) {
      console.log(`✓ ${existingCount} templates already exist - skipping\n`);
      return;
    }

    // Load templates from JSON files
    const templates = getAllTemplates();
    console.log(`📝 Seeding ${templates.length} template characters...\n`);

    let successCount = 0;

    for (const template of templates) {
      try {
        await db.insert(userCharacters).values({
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
          view_count: Math.floor(Math.random() * 100) + 10,
          interaction_count: Math.floor(Math.random() * 50) + 5,
          popularity_score: template.featured
            ? 9000 + Math.floor(Math.random() * 1000)
            : Math.floor(Math.random() * 1000) + 100,
        });

        console.log(
          `  ✓ ${template.name} (${template.category})${template.featured ? " ⭐" : ""}`
        );
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed: ${template.name}`, error);
      }
    }

    console.log(`\n✅ Seeded ${successCount}/${templates.length} templates`);

    if (successCount > 0) {
      await marketplaceCache.invalidateAll(firstOrg.id);
      console.log(`✓ Cache cleared\n`);
    }
  } catch (error) {
    console.error("\n❌ Seeding Error:", error);
    throw error;
  }
}

seedLocalDev()
  .then(() => {
    console.log("✓ Local dev seeding complete\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
