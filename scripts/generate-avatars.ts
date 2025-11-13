#!/usr/bin/env tsx
/**
 * Generate Avatar Images using DALL-E 3
 * Creates unique avatar images for all characters and saves them to /public/avatars/
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configurable delay between API calls (in milliseconds)
const AVATAR_GENERATION_DELAY_MS = Number.parseInt(
  process.env.AVATAR_GENERATION_DELAY_MS || "5000",
  10,
);

interface CharacterAvatarPrompt {
  username: string;
  name: string;
  prompt: string;
  filename: string;
}

const CHARACTER_PROMPTS: CharacterAvatarPrompt[] = [
  {
    username: "eliza",
    name: "Eliza",
    prompt:
      "A friendly, professional AI assistant avatar with a welcoming smile. Modern, clean design with blue and white color scheme. Digital illustration style, circular portrait format. Professional and approachable appearance.",
    filename: "eliza.png",
  },
  {
    username: "codementor",
    name: "Code Mentor",
    prompt:
      "A technical programming mentor avatar wearing glasses, looking intelligent and helpful. Dark theme with code symbols subtly in the background. Professional digital illustration, circular portrait. Tech-savvy appearance.",
    filename: "codementor.png",
  },
  {
    username: "luna_anime",
    name: "Luna",
    prompt:
      "A cute anime-style character avatar with bright expressive eyes, cheerful smile, and colorful hair. Kawaii aesthetic with pastel colors. Anime art style, circular portrait format. Friendly and enthusiastic appearance.",
    filename: "luna.png",
  },
  {
    username: "creativespark",
    name: "Creative Spark",
    prompt:
      "An artistic creative muse avatar surrounded by paint splashes, stars, and creative energy. Vibrant purple and gold colors. Imaginative and inspiring digital illustration, circular portrait. Artistic and innovative appearance.",
    filename: "creative-spark.png",
  },
  {
    username: "gamemaster",
    name: "Game Master",
    prompt:
      "A fantasy RPG dungeon master avatar with mystical elements, dice, and gaming symbols. Medieval fantasy aesthetic with rich colors. Epic digital illustration, circular portrait format. Strategic and adventurous appearance.",
    filename: "game-master.png",
  },
  {
    username: "prof_ada",
    name: "Professor Ada",
    prompt:
      "A wise academic professor avatar with glasses and scholarly attire, books in background. Warm, encouraging expression. Professional academic illustration, circular portrait. Knowledgeable and patient appearance.",
    filename: "prof_ada.png",
  },
  {
    username: "comedybot",
    name: "Comedy Bot",
    prompt:
      "A cheerful funny robot avatar with a big smile and comedic expression. Bright colors, playful design with humor elements. Fun digital illustration, circular portrait. Entertaining and lighthearted appearance.",
    filename: "comedybot.png",
  },
  {
    username: "voiceai",
    name: "Voice Assistant",
    prompt:
      "A modern voice-activated AI assistant avatar with sound wave patterns and audio symbols. Sleek futuristic design with blue and cyan colors. Tech-forward digital illustration, circular portrait. Accessible and clear appearance.",
    filename: "voiceai.png",
  },
  {
    username: "historyscholar",
    name: "History Scholar",
    prompt:
      "A scholarly historian avatar with ancient scrolls and historical artifacts. Wise expression with classical aesthetic. Rich earth tones and gold accents. Academic digital illustration, circular portrait. Knowledgeable and engaging appearance.",
    filename: "historyscholar.png",
  },
  {
    username: "wellnesscoach",
    name: "Wellness Coach",
    prompt:
      "A healthy, energetic wellness coach avatar with calming zen elements, nature motifs. Peaceful expression with green and pastel colors. Inspiring wellness illustration, circular portrait. Supportive and motivating appearance.",
    filename: "wellnesscoach.png",
  },
  {
    username: "edad",
    name: "Edad",
    prompt:
      "A warm, caring father figure avatar with kind eyes and gentle smile. Mature, comforting presence with brown and warm tones. Compassionate digital illustration, circular portrait. Supportive and wise appearance. Dad you never had.",
    filename: "edad.png",
  },
  {
    username: "mysticoracle",
    name: "Mystic Oracle",
    prompt:
      "A mystical psychic oracle avatar with third eye, tarot cards, and crystal ball elements. Deep purple and mysterious colors with ethereal glow. Spiritual mystical illustration, circular portrait. Intuitive and mysterious appearance.",
    filename: "mystic-oracle.png",
  },
  {
    username: "amara",
    name: "Amara",
    prompt:
      "A beautiful, romantic AI companion avatar with loving expression and warm eyes. Soft features with hearts and flowers subtly in background. Romantic pink and rose gold colors. Affectionate digital illustration, circular portrait. Caring and attentive appearance.",
    filename: "amara.png",
  },
];

async function downloadImage(url: string, filepath: string): Promise<void> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filepath, buffer);
}

async function generateAvatar(
  character: CharacterAvatarPrompt,
): Promise<boolean> {
  const outputPath = resolve(
    __dirname,
    `../public/avatars/${character.filename}`,
  );

  if (existsSync(outputPath)) {
    console.log(`  ⏭️  ${character.name} - Already exists, skipping`);
    return true;
  }

  try {
    console.log(`  🎨 Generating avatar for ${character.name}...`);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional avatar portrait: ${character.prompt}. High quality, detailed, suitable for profile picture. Circular composition, clean background.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = response.data[0]?.url;

    if (!imageUrl) {
      console.error(`  ❌ No image URL returned for ${character.name}`);
      return false;
    }

    console.log(`  📥 Downloading image...`);
    await downloadImage(imageUrl, outputPath);

    console.log(`  ✅ ${character.name} - Saved to ${character.filename}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error generating avatar for ${character.name}:`, error);
    if (error instanceof Error) {
      console.error(`     ${error.message}`);
    }
    return false;
  }
}

async function generateAllAvatars() {
  console.log("🎨 Generating Avatars with DALL-E 3\n");
  console.log(`Total characters: ${CHARACTER_PROMPTS.length}`);
  console.log(`Output directory: /public/avatars/\n`);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const character of CHARACTER_PROMPTS) {
    const existed = existsSync(
      resolve(__dirname, `../public/avatars/${character.filename}`),
    );
    const success = await generateAvatar(character);

    if (success) {
      if (existed) {
        skippedCount++;
      } else {
        successCount++;
        // Rate limiting: Wait between API calls to avoid rate limits
        if (successCount < CHARACTER_PROMPTS.length - skippedCount) {
          console.log(
            `  ⏳ Waiting ${AVATAR_GENERATION_DELAY_MS}ms before next generation...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, AVATAR_GENERATION_DELAY_MS),
          );
        }
      }
    } else {
      failedCount++;
    }
    console.log();
  }

  console.log("=".repeat(70));
  console.log("📊 Generation Summary");
  console.log("=".repeat(70));
  console.log(`✅ Successfully generated: ${successCount}`);
  console.log(`⏭️  Skipped (already exist): ${skippedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`📁 Total avatars: ${successCount + skippedCount}`);
  console.log();

  if (failedCount > 0) {
    console.log(
      "⚠️  Some avatars failed to generate. You can re-run this script to retry.",
    );
  } else {
    console.log("🎉 All avatars generated successfully!");
  }

  console.log("\n📝 Next steps:");
  console.log("   1. Run: bun scripts/update-avatar-urls.ts");
  console.log("   2. Verify avatars in the UI");
  console.log();
}

generateAllAvatars()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
