/**
 * Org App Development Seed Script
 * 
 * Seeds the database with test data for org-app local development.
 * Similar to seed-app-dev.ts but for the org app.
 * 
 * Usage: bun run db:orgapp:seed
 */

import { db } from "@/db";
import { users, organizations, appAuthSessions } from "@/db/schemas";
import { eq } from "drizzle-orm";

const ORG_APP_USER_EMAIL = "org-test@eliza.ai";
const ORG_APP_ORG_NAME = "Org App Test Organization";

async function main() {
  console.log("🌱 Seeding org-app development data...\n");

  // Check if test user exists
  let testUser = await db.query.users.findFirst({
    where: eq(users.email, ORG_APP_USER_EMAIL),
    with: {
      organization: true,
    },
  });

  let organization;

  if (!testUser) {
    console.log("Creating test organization...");
    
    // Create organization first
    const [org] = await db
      .insert(organizations)
      .values({
        name: ORG_APP_ORG_NAME,
        is_active: true,
      })
      .returning();
    
    organization = org;
    console.log(`✅ Created organization: ${org.name} (${org.id})`);

    // Create test user
    console.log("Creating test user...");
    const [user] = await db
      .insert(users)
      .values({
        email: ORG_APP_USER_EMAIL,
        name: "Org App Test User",
        privy_id: `org-test-${Date.now()}`,
        organization_id: org.id,
        is_active: true,
      })
      .returning();

    testUser = { ...user, organization: org };
    console.log(`✅ Created user: ${user.email} (${user.id})`);
  } else {
    organization = testUser.organization;
    console.log(`ℹ️ Test user already exists: ${testUser.email}`);
  }

  // Create a pre-authenticated app session for easier testing
  const sessionId = `org-dev-session-${Date.now()}`;
  const authToken = `app_orgdev_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db.insert(appAuthSessions).values({
    id: sessionId,
    status: "authenticated",
    callback_url: "http://localhost:3002/auth/callback",
    app_id: "org-app",
    user_id: testUser.id,
    organization_id: organization!.id,
    auth_token: authToken,
    auth_token_created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  console.log("\n📋 Development credentials:");
  console.log("─".repeat(60));
  console.log(`User Email:        ${ORG_APP_USER_EMAIL}`);
  console.log(`User ID:           ${testUser.id}`);
  console.log(`Organization ID:   ${organization!.id}`);
  console.log(`Organization Name: ${organization!.name}`);
  console.log("─".repeat(60));
  console.log(`\n🔑 Pre-authenticated token for testing:\n`);
  console.log(`   TEST_APP_TOKEN=${authToken}`);
  console.log(`\n   Add this to your .env.local for authenticated tests.`);
  console.log("─".repeat(60));

  console.log("\n📦 To start org-app in dev mode:");
  console.log("   1. cd apps/org-app");
  console.log("   2. bun install");
  console.log("   3. bun run dev");
  console.log("\n   Org App will be available at http://localhost:3002");

  console.log("\n✅ Seeding complete!\n");
}

main().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});

