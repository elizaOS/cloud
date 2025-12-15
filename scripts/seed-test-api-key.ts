/**
 * Seed Test API Key
 *
 * Creates a test organization, user, and API key for integration testing.
 * Run with: bun scripts/seed-test-api-key.ts
 */

import "@dotenvx/dotenvx";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { organizations } from "../db/schemas/organizations";
import { users } from "../db/schemas/users";
import { apiKeys } from "../db/schemas/api-keys";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

const TEST_ORG_ID = "ec42ddc9-c6bc-4306-815b-438ba59bf876";
const TEST_USER_ID = "318fafde-d785-4990-9bda-a4a2eed8db62";
const TEST_API_KEY =
  "eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_API_KEY_ID = "926a821a-bb75-4eb8-b43f-05ed8ae9020c";

async function seedTestData() {
  console.log("🌱 Seeding test data...\n");

  // 1. Create or update organization
  const existingOrg = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, TEST_ORG_ID))
    .limit(1);

  if (existingOrg.length === 0) {
    console.log("Creating test organization...");
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: "Test Organization",
      slug: "test-org-" + Date.now(),
      credit_balance: "1000.00",
      is_active: true,
    });
    console.log("✅ Organization created");
  } else {
    console.log("✅ Organization already exists");
    // Update credit balance
    await db
      .update(organizations)
      .set({ credit_balance: "1000.00" })
      .where(eq(organizations.id, TEST_ORG_ID));
    console.log("✅ Organization credit balance updated to 1000.00");
  }

  // 2. Create or update user
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, TEST_USER_ID))
    .limit(1);

  if (existingUser.length === 0) {
    console.log("Creating test user...");
    await db.insert(users).values({
      id: TEST_USER_ID,
      privy_user_id: "test-privy-id-" + Date.now(),
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      organization_id: TEST_ORG_ID,
      role: "admin",
      is_active: true,
    });
    console.log("✅ User created");
  } else {
    console.log("✅ User already exists");
  }

  // 3. Create or update API key
  const keyHash = crypto
    .createHash("sha256")
    .update(TEST_API_KEY)
    .digest("hex");

  const existingKey = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, TEST_API_KEY_ID))
    .limit(1);

  if (existingKey.length === 0) {
    console.log("Creating test API key...");
    await db.insert(apiKeys).values({
      id: TEST_API_KEY_ID,
      organization_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      name: "Test API Key",
      key: TEST_API_KEY,
      key_hash: keyHash,
      key_prefix: "eliza_test_",
      is_active: true,
    });
    console.log("✅ API key created");
  } else {
    // Update the key hash if it changed
    console.log("Updating existing API key...");
    await db
      .update(apiKeys)
      .set({
        key: TEST_API_KEY,
        key_hash: keyHash,
        is_active: true,
      })
      .where(eq(apiKeys.id, TEST_API_KEY_ID));
    console.log("✅ API key updated");
  }

  console.log("\n✅ Test data seeded successfully!");
  console.log(`\nTest API Key: ${TEST_API_KEY}`);
  console.log(`Organization ID: ${TEST_ORG_ID}`);
  console.log(`User ID: ${TEST_USER_ID}`);

  await pool.end();
  process.exit(0);
}

seedTestData().catch(async (error) => {
  console.error("❌ Error seeding test data:", error);
  await pool.end();
  process.exit(1);
});
