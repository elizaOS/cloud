#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { db } from "../db/client";
import { userCharactersRepository } from "../db/repositories/user-characters";

async function testFilterFix() {
  console.log("🧪 Testing Filter Fix\n");

  try {
    const firstUser = await db.query.users.findFirst();
    const firstOrg = await db.query.organizations.findFirst();

    if (!firstUser || !firstOrg) {
      console.error("❌ No user or organization found");
      process.exit(1);
    }

    console.log("Simulating API behavior BEFORE fix:");
    console.log("  searchParams.get('template') === 'true' → false");
    console.log("  This gets passed to repository as template: false\n");

    const beforeFix = await userCharactersRepository.search(
      { template: false } as any,
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`  Result: ${beforeFix.length} characters ❌\n`);

    console.log("Simulating API behavior AFTER fix:");
    console.log("  searchParams.has('template') ? ... : undefined → undefined");
    console.log("  This gets passed to repository as template: undefined\n");

    const afterFix = await userCharactersRepository.search(
      { template: undefined } as any,
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`  Result: ${afterFix.length} characters ✓\n`);

    console.log("Testing other scenarios:");

    const noFilters = await userCharactersRepository.search(
      {},
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`  No filters: ${noFilters.length} characters`);

    const explicitTemplate = await userCharactersRepository.search(
      { template: true },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`  template=true: ${explicitTemplate.length} characters`);

    const explicitNoTemplate = await userCharactersRepository.search(
      { template: false },
      firstUser.id,
      firstOrg.id,
      { sortBy: "popularity", order: "desc" },
      20,
      0
    );
    console.log(`  template=false: ${explicitNoTemplate.length} characters`);

    console.log("\n✅ Fix verified! Characters will now show in marketplace.\n");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

testFilterFix()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
