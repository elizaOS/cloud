/**
 * Seed script for Miniapp Development Environment
 *
 * Creates:
 * 1. A test organization with credits
 * 2. A test user with known hardhat wallet address
 * 3. A miniapp app registration with localhost URLs allowed
 * 4. An API key for the miniapp
 * 5. Links the user to the app
 *
 * Usage:
 *   bun run scripts/seed-miniapp-dev.ts
 *   bun run scripts/seed-miniapp-dev.ts --force  # Regenerate API key
 *
 * This script is idempotent - safe to run multiple times.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../db/client";
import * as fs from "fs";
import * as path from "path";
import { users } from "../db/schemas/users";
import { organizations } from "../db/schemas/organizations";
import { apps, appUsers } from "../db/schemas/apps";
import { apiKeys } from "../db/schemas/api-keys";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// Track what was created vs reused for idempotency summary
interface SeedResult {
  organization: boolean;
  user: boolean;
  miniapp: boolean;
  apiKey: { created: boolean; regenerated: boolean };
  appUserLink: boolean;
}

// Known hardhat test wallet - first account from standard mnemonic
// Mnemonic: "test test test test test test test test test test test junk"
// This is the standard hardhat/foundry test mnemonic - NEVER use with real funds!
const TEST_WALLET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const MINIAPP_CONFIG = {
  name: "Eliza Miniapp Dev",
  slug: "eliza-miniapp-dev",
  description: "Development miniapp for testing cloud integration",
  appUrl: "http://localhost:3001",
  allowedOrigins: [
    "http://localhost:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
  ],
  features: {
    chat: true,
    image: true,
    video: false,
    voice: true,
    agents: true,
    embedding: true,
  },
};

const TEST_USER_CONFIG = {
  email: "miniapp-dev@elizacloud.test",
  name: "Miniapp Dev User",
  walletAddress: TEST_WALLET_ADDRESS.toLowerCase(),
};

const TEST_ORG_CONFIG = {
  name: "Miniapp Dev Organization",
  slug: "miniapp-dev-org",
  creditBalance: "100.00",
};

const API_KEY_PERMISSIONS = [
  "apps.access",
  "generation.all",
  "agents.all",
  "chat.all",
  "affiliate:create-character",
];

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `eliza_${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12);
  return { key, hash, prefix };
}

async function createApiKey(organizationId: string, userId: string) {
  const { key, hash, prefix } = generateApiKey();
  const [newApiKey] = await db
    .insert(apiKeys)
    .values({
      name: `${MINIAPP_CONFIG.name} API Key`,
      description: "Auto-generated API key for miniapp development",
      key,
      key_hash: hash,
      key_prefix: prefix,
      organization_id: organizationId,
      user_id: userId,
      permissions: API_KEY_PERMISSIONS,
      rate_limit: 10000,
      is_active: true,
    })
    .returning();
  return { apiKey: newApiKey, plainKey: key, prefix };
}

/**
 * Update specific keys in miniapp/.env.local
 * Only modifies ELIZA_CLOUD_API_KEY and NEXT_PUBLIC_ELIZA_CLOUD_URL
 * Preserves all other content exactly as-is
 */
function writeMiniappEnvLocal(apiKey: string): void {
  const envPath = path.join(process.cwd(), "miniapp", ".env.local");

  const keysToUpdate: Record<string, string> = {
    ELIZA_CLOUD_API_KEY: apiKey,
    NEXT_PUBLIC_ELIZA_CLOUD_URL: "http://localhost:3000",
  };

  let lines: string[] = [];
  const updatedKeys = new Set<string>();

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [key, value] of Object.entries(keysToUpdate)) {
        if (line.startsWith(`${key}=`) || line.startsWith(`${key} =`)) {
          lines[i] = `${key}=${value}`;
          updatedKeys.add(key);
          break;
        }
      }
    }
  }

  for (const [key, value] of Object.entries(keysToUpdate)) {
    if (!updatedKeys.has(key)) {
      let insertIndex = 0;
      while (insertIndex < lines.length && lines[insertIndex].startsWith("#")) {
        insertIndex++;
      }
      lines.splice(insertIndex, 0, `${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, lines.join("\n"));
  console.log("  ✓ Updated miniapp/.env.local");
}

function printSummary(
  result: SeedResult,
  user: { id: string },
  organization: { id: string; name: string },
  miniapp: { id: string; slug: string },
  apiKeyPlain: string | null
) {
  console.log("\n" + "=".repeat(60));
  console.log("=== MINIAPP DEVELOPMENT ENVIRONMENT READY ===");
  console.log("=".repeat(60));

  const created = [
    result.organization,
    result.user,
    result.miniapp,
    result.apiKey.created,
    result.appUserLink,
  ].filter(Boolean).length;

  const reused = 5 - created - (result.apiKey.regenerated ? 1 : 0);

  console.log("\n📊 Idempotency Summary:");
  console.log(`   Created: ${created}  |  Reused: ${reused}${result.apiKey.regenerated ? "  |  Regenerated: 1" : ""}`);
  console.log("");
  console.log(`   Organization: ${result.organization ? "✨ NEW" : "♻️  reused"}`);
  console.log(`   User:         ${result.user ? "✨ NEW" : "♻️  reused"}`);
  console.log(`   Miniapp:      ${result.miniapp ? "✨ NEW" : "♻️  reused"}`);
  console.log(`   API Key:      ${result.apiKey.created ? "✨ NEW" : result.apiKey.regenerated ? "🔄 regenerated" : "♻️  reused"}`);
  console.log(`   App User:     ${result.appUserLink ? "✨ NEW" : "♻️  reused"}`);

  console.log("\n📋 Test User Details:");
  console.log(`   User ID:        ${user.id}`);
  console.log(`   Email:          ${TEST_USER_CONFIG.email}`);
  console.log(`   Wallet Address: ${TEST_WALLET_ADDRESS}`);
  console.log(`   Organization:   ${organization.name} (${organization.id})`);
  console.log(`   Credits:        $${TEST_ORG_CONFIG.creditBalance}`);

  console.log("\n📱 Miniapp Details:");
  console.log(`   App ID:         ${miniapp.id}`);
  console.log(`   Slug:           ${miniapp.slug}`);
  console.log(`   App URL:        ${MINIAPP_CONFIG.appUrl}`);
  console.log(`   Allowed Origins: ${MINIAPP_CONFIG.allowedOrigins.join(", ")}`);

  if (apiKeyPlain) {
    console.log("\n🔑 NEW API Key (added to miniapp/.env.local):");
    console.log("─".repeat(60));
    console.log(`ELIZA_CLOUD_API_KEY=${apiKeyPlain}`);
    console.log(`NEXT_PUBLIC_ELIZA_CLOUD_URL=http://localhost:3000`);
    console.log("─".repeat(60));
  }

  console.log("\n🔐 Test Wallet:");
  console.log(`   Address: ${TEST_WALLET_ADDRESS}`);
  console.log('   Seed:    "test test test test test test test test test test test junk"');
}

async function main() {
  console.log("\n=== Eliza Cloud - Miniapp Development Seed ===\n");

  const result: SeedResult = {
    organization: false,
    user: false,
    miniapp: false,
    apiKey: { created: false, regenerated: false },
    appUserLink: false,
  };

  // Step 1: Organization
  console.log("[1/5] Organization...");
  let organization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, TEST_ORG_CONFIG.slug),
  });

  if (organization) {
    console.log(`  ✓ Reusing: ${organization.id}`);
  } else {
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: TEST_ORG_CONFIG.name,
        slug: TEST_ORG_CONFIG.slug,
        credit_balance: TEST_ORG_CONFIG.creditBalance,
      })
      .returning();
    organization = newOrg;
    result.organization = true;
    console.log(`  ✓ Created: ${organization.id}`);
  }

  // Step 2: User
  console.log("\n[2/5] User...");
  let user = await db.query.users.findFirst({
    where: eq(users.wallet_address, TEST_USER_CONFIG.walletAddress),
  });

  if (user) {
    console.log(`  ✓ Reusing: ${user.id}`);
    if (user.organization_id !== organization.id) {
      await db
        .update(users)
        .set({ organization_id: organization.id })
        .where(eq(users.id, user.id));
      console.log("  ✓ Updated organization link");
    }
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: TEST_USER_CONFIG.email,
        name: TEST_USER_CONFIG.name,
        wallet_address: TEST_USER_CONFIG.walletAddress,
        wallet_chain_type: "ethereum",
        wallet_verified: true,
        organization_id: organization.id,
        role: "owner",
        is_anonymous: false,
        is_active: true,
      })
      .returning();
    user = newUser;
    result.user = true;
    console.log(`  ✓ Created: ${user.id}`);
  }

  // Step 3: Miniapp + API Key
  console.log("\n[3/5] Miniapp & API Key...");
  let miniapp = await db.query.apps.findFirst({
    where: eq(apps.slug, MINIAPP_CONFIG.slug),
  });

  let apiKeyPlain: string | null = null;

  if (miniapp) {
    console.log(`  ✓ Reusing miniapp: ${miniapp.id}`);

    // Handle API key
    if (miniapp.api_key_id) {
      const existingKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, miniapp.api_key_id),
      });

      if (existingKey) {
          await db
            .update(apiKeys)
            .set({ permissions: API_KEY_PERMISSIONS, updated_at: new Date() })
            .where(eq(apiKeys.id, existingKey.id));
          console.log(`  ✓ Reusing API key: ${existingKey.key_prefix}...`);
      } else {
        // Key was deleted, create new
        const { apiKey: newKey, plainKey, prefix } = await createApiKey(organization.id, user.id);
        await db.update(apps).set({ api_key_id: newKey.id }).where(eq(apps.id, miniapp.id));
        apiKeyPlain = plainKey;
        result.apiKey.created = true;
        console.log(`  ✓ Created API key: ${prefix}...`);
        writeMiniappEnvLocal(apiKeyPlain);
      }
    } else {
      // No key linked
      const { apiKey: newKey, plainKey, prefix } = await createApiKey(organization.id, user.id);
      await db.update(apps).set({ api_key_id: newKey.id }).where(eq(apps.id, miniapp.id));
      apiKeyPlain = plainKey;
      result.apiKey.created = true;
      console.log(`  ✓ Created API key: ${prefix}...`);
      writeMiniappEnvLocal(apiKeyPlain);
    }

    // Sync allowed origins
    await db
      .update(apps)
      .set({ allowed_origins: MINIAPP_CONFIG.allowedOrigins })
      .where(eq(apps.id, miniapp.id));
  } else {
    // Create new miniapp with API key
    const { apiKey: newKey, plainKey, prefix } = await createApiKey(organization.id, user.id);
    apiKeyPlain = plainKey;
    result.apiKey.created = true;
    console.log(`  ✓ Created API key: ${prefix}...`);
    writeMiniappEnvLocal(apiKeyPlain);

    const [newApp] = await db
      .insert(apps)
      .values({
        name: MINIAPP_CONFIG.name,
        slug: MINIAPP_CONFIG.slug,
        description: MINIAPP_CONFIG.description,
        organization_id: organization.id,
        created_by_user_id: user.id,
        app_url: MINIAPP_CONFIG.appUrl,
        allowed_origins: MINIAPP_CONFIG.allowedOrigins,
        api_key_id: newKey.id,
        features_enabled: MINIAPP_CONFIG.features,
        rate_limit_per_minute: 120,
        rate_limit_per_hour: 10000,
        is_active: true,
        is_approved: true,
      })
      .returning();

    miniapp = newApp;
    result.miniapp = true;
    console.log(`  ✓ Created miniapp: ${miniapp.id}`);
  }

  // Step 4: Link user to app
  console.log("\n[4/5] App User Link...");
  const existingAppUser = await db.query.appUsers.findFirst({
    where: and(eq(appUsers.app_id, miniapp.id), eq(appUsers.user_id, user.id)),
  });

  if (existingAppUser) {
    console.log("  ✓ Reusing existing link");
  } else {
    await db.insert(appUsers).values({
      app_id: miniapp.id,
      user_id: user.id,
      signup_source: "seed-script",
    });
    result.appUserLink = true;
    console.log("  ✓ Created link");
  }

  // Step 5: Summary
  console.log("\n[5/5] Done!");
  printSummary(result, user, organization, miniapp, apiKeyPlain);
}

main().catch((error) => {
  console.error("\n❌ Error:", error);
  process.exit(1);
});
