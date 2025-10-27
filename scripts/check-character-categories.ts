#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";

async function checkCategories() {
  console.log("🔍 Checking Character Categories\n");

  const allChars = await db.select({
    id: userCharacters.id,
    name: userCharacters.name,
    category: userCharacters.category,
    is_template: userCharacters.is_template,
  }).from(userCharacters);

  console.log(`Total characters: ${allChars.length}\n`);
  
  const categoryGroups: Record<string, string[]> = {};
  
  allChars.forEach((char) => {
    const cat = char.category || "uncategorized";
    if (!categoryGroups[cat]) {
      categoryGroups[cat] = [];
    }
    categoryGroups[cat].push(char.name);
  });
  
  console.log("Characters by category:");
  console.log("=".repeat(60));
  
  Object.entries(categoryGroups).sort().forEach(([category, names]) => {
    console.log(`\n${category.toUpperCase()} (${names.length}):`);
    names.forEach((name) => {
      console.log(`  - ${name}`);
    });
  });
  
  console.log("\n" + "=".repeat(60));
  console.log(`\nTotal categories: ${Object.keys(categoryGroups).length}\n`);
}

checkCategories()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
