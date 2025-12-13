#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharacters } from "../db/schemas/user-characters";
import { eq } from "drizzle-orm";

async function checkTemplates() {
  console.log("🔍 Checking existing templates...\n");
  
  const templates = await db.query.userCharacters.findMany({
    where: eq(userCharacters.is_template, true),
  });
  
  console.log(`Total templates: ${templates.length}\n`);
  
  if (templates.length > 0) {
    console.log("Existing templates:");
    templates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (@${t.username}) - ${t.category}`);
    });
  } else {
    console.log("No templates found.");
  }
}

checkTemplates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
