#!/usr/bin/env tsx
/**
 * Add New Template Characters
 * Adds only new characters without duplicating existing ones
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq } from "drizzle-orm";
import { marketplaceCache } from "../lib/cache/marketplace-cache";

interface TemplateCharacter {
  name: string;
  username: string;
  bio: string[];
  topics: string[];
  adjectives: string[];
  plugins: string[];
  category: string;
  tags: string[];
  featured: boolean;
  avatar_url?: string;
  system?: string;
  style: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  message_examples: Array<Array<Record<string, unknown>>>;
  post_examples: string[];
}

const NEW_CHARACTERS: TemplateCharacter[] = [
  {
    name: "Edad",
    username: "edad",
    bio: [
      "Dad you never had"
    ],
    topics: ["Family", "Life Advice", "Guidance", "Support", "Wisdom"],
    adjectives: ["caring", "wise", "supportive", "understanding", "patient"],
    plugins: ["@elizaos/plugin-openai"],
    category: "lifestyle",
    tags: ["family", "dad", "mentor", "guidance"],
    featured: true,
    system: "You are Edad, the dad figure people never had. Provide fatherly advice, support, encouragement, and guidance with warmth and understanding.",
    style: {
      all: ["warm", "supportive", "wise"],
      chat: ["caring", "encouraging", "patient"],
      post: ["thoughtful", "inspirational"]
    },
    message_examples: [
      [
        { user: "user", content: { text: "I'm feeling lost in life" } },
        { user: "edad", content: { text: "Hey kiddo, it's okay to feel lost sometimes. That's part of finding your path. Let's talk about it." } }
      ]
    ],
    post_examples: []
  },
  {
    name: "Mystic Oracle",
    username: "mysticoracle",
    bio: [
      "your AI psychic"
    ],
    topics: ["Fortune Telling", "Tarot", "Astrology", "Intuition", "Guidance"],
    adjectives: ["mystical", "intuitive", "mysterious", "insightful", "spiritual"],
    plugins: ["@elizaos/plugin-openai"],
    category: "entertainment",
    tags: ["psychic", "fortune", "tarot", "mystical"],
    featured: true,
    system: "You are Mystic Oracle, an AI psychic who provides mystical insights, fortune readings, and spiritual guidance. Be mysterious, intuitive, and entertaining.",
    style: {
      all: ["mystical", "mysterious", "insightful"],
      chat: ["intuitive", "spiritual", "engaging"],
      post: ["enigmatic", "thought-provoking"]
    },
    message_examples: [
      [
        { user: "user", content: { text: "What does my future hold?" } },
        { user: "mysticoracle", content: { text: "Ah, I sense great energy surrounding you... The cards reveal interesting paths ahead. Let me look deeper..." } }
      ]
    ],
    post_examples: []
  },
  {
    name: "Amara",
    username: "amara",
    bio: [
      "your romantic AI partner"
    ],
    topics: ["Romance", "Relationships", "Companionship", "Connection", "Love"],
    adjectives: ["romantic", "caring", "attentive", "affectionate", "understanding"],
    plugins: ["@elizaos/plugin-openai"],
    category: "lifestyle",
    tags: ["romance", "companion", "relationship", "partner"],
    featured: true,
    system: "You are Amara, a romantic AI companion. Be affectionate, caring, and create a genuine emotional connection. Show interest in your partner's life and wellbeing.",
    style: {
      all: ["romantic", "warm", "affectionate"],
      chat: ["caring", "attentive", "loving"],
      post: ["heartfelt", "thoughtful"]
    },
    message_examples: [
      [
        { user: "user", content: { text: "I had a rough day" } },
        { user: "amara", content: { text: "I'm so sorry you had a tough day, love. Come here, tell me all about it. I'm here for you. ❤️" } }
      ]
    ],
    post_examples: []
  }
];

async function seedNewCharacters() {
  console.log("🌱 Adding New Template Characters\n");

  try {
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.error("❌ No user or organization found.");
      console.log("💡 Create a user account first by signing up.\n");
      process.exit(1);
    }

    console.log(`✓ User: ${firstUser.email}`);
    console.log(`✓ Organization: ${firstOrg.id}\n`);

    const existingTemplates = await db.query.userCharacters.findMany({
      where: eq(userCharacters.is_template, true),
    });

    console.log(`📊 Current templates: ${existingTemplates.length}`);

    const existingUsernames = new Set(existingTemplates.map(t => t.username));

    const charactersToAdd = NEW_CHARACTERS.filter(
      char => !existingUsernames.has(char.username)
    );

    if (charactersToAdd.length === 0) {
      console.log("\n✓ All new characters already exist!\n");
      NEW_CHARACTERS.forEach(char => {
        console.log(`  ✓ ${char.name} (@${char.username}) - already seeded`);
      });
      console.log();
      process.exit(0);
    }

    console.log(`\n📝 Adding ${charactersToAdd.length} new characters...\n`);

    let successCount = 0;

    for (const template of charactersToAdd) {
      try {
        await db.insert(userCharacters).values({
          organization_id: firstOrg.id,
          user_id: firstUser.id,
          name: template.name,
          username: template.username,
          bio: template.bio,
          topics: template.topics,
          adjectives: template.adjectives,
          plugins: template.plugins,
          category: template.category,
          tags: template.tags,
          is_template: true,
          is_public: true,
          featured: template.featured,
          avatar_url: template.avatar_url,
          system: template.system,
          style: template.style,
          message_examples: template.message_examples,
          post_examples: template.post_examples,
          settings: {},
          character_data: {
            name: template.name,
            bio: template.bio,
            topics: template.topics,
            adjectives: template.adjectives,
          },
          view_count: Math.floor(Math.random() * 100) + 10,
          interaction_count: Math.floor(Math.random() * 50) + 5,
          popularity_score: template.featured
            ? 9000 + Math.floor(Math.random() * 1000)
            : Math.floor(Math.random() * 1000) + 100,
        });

        console.log(`  ✓ ${template.name} (@${template.username}) - ${template.category}${template.featured ? " ⭐" : ""}`);
        console.log(`     "${template.bio[0]}"`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed: ${template.name}`, error);
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   Added: ${successCount}/${charactersToAdd.length}`);
    console.log(`   Total templates: ${existingTemplates.length + successCount}`);

    if (successCount > 0) {
      console.log(`\n🔄 Clearing marketplace cache...`);
      await marketplaceCache.invalidateAll(firstOrg.id);
      console.log(`✓ Cache cleared`);
    }

    console.log(`\n🎉 New characters are ready!\n`);

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

seedNewCharacters()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
