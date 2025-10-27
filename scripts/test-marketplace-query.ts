#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharactersRepository } from "../db/repositories/user-characters";

async function testQuery() {
  console.log("Testing marketplace query...\n");

  try {
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.error("No user or organization found");
      process.exit(1);
    }

    console.log(`User: ${firstUser.email}`);
    console.log(`Organization: ${firstOrg.id}\n`);

    console.log("Testing search with NO filters (default)...");
    const noFilters = await userCharactersRepository.search(
      {},
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`Found ${noFilters.length} characters`);
    noFilters.forEach((char) => {
      console.log(`  - ${char.name} (template: ${char.is_template}, public: ${char.is_public})`);
    });

    console.log("\nTesting count with NO filters...");
    const count = await userCharactersRepository.count(
      {},
      firstUser.id,
      firstOrg.id
    );
    console.log(`Total count: ${count}`);

    console.log("\nTesting search with template=true filter...");
    const templateOnly = await userCharactersRepository.search(
      { template: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`Found ${templateOnly.length} template characters`);

    console.log("\nTesting count with template=true filter...");
    const templateCount = await userCharactersRepository.count(
      { template: true },
      firstUser.id,
      firstOrg.id
    );
    console.log(`Total template count: ${templateCount}`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

testQuery()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
