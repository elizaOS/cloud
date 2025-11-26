#!/usr/bin/env tsx

/**
 * Create Affiliate API Key Script
 *
 * This script generates a new API key with affiliate permissions
 * for external partners like CloneUrCrush to create characters.
 *
 * Usage:
 *   bun run scripts/create-affiliate-key.ts "clone-your-crush"
 *
 * Or with additional options:
 *   bun run scripts/create-affiliate-key.ts "clone-your-crush" \
 *     --rate-limit 200 \
 *     --description "CloneUrCrush landing page integration"
 */

// Load environment variables
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local first, then .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { apiKeysService } from "@/lib/services/api-keys";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

// Color output helpers
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    log("\n📝 Create Affiliate API Key", colors.bright);
    log("\nUsage:", colors.cyan);
    log("  bun run scripts/create-affiliate-key.ts <affiliate-name> [options]");
    log("\nOptions:");
    log("  --rate-limit <number>     Requests per hour (default: 100)");
    log("  --description <text>      API key description");
    log(
      "  --org-id <uuid>          Organization ID (default: finds first org)"
    );
    log("  --user-id <uuid>         User ID (default: finds first admin user)");
    log("\nExample:");
    log(
      '  bun run scripts/create-affiliate-key.ts "clone-your-crush" --rate-limit 200\n'
    );
    process.exit(0);
  }

  const affiliateName = args[0];

  // Parse options
  let rateLimit = 100;
  let description = `Affiliate API key for ${affiliateName}`;
  let orgId: string | null = null;
  let userId: string | null = null;

  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case "--rate-limit":
        rateLimit = parseInt(value);
        break;
      case "--description":
        description = value;
        break;
      case "--org-id":
        orgId = value;
        break;
      case "--user-id":
        userId = value;
        break;
    }
  }

  log("\n🔐 Creating Affiliate API Key", colors.bright);
  log("─".repeat(50));

  try {
    // 1. Get or find organization
    if (!orgId) {
      log("\n📋 Finding organization...", colors.cyan);
      const orgsResult = await db.execute(
        sql`SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1`
      );

      if (orgsResult.rows.length === 0) {
        log(
          "❌ No organizations found. Please create an organization first.",
          colors.red
        );
        process.exit(1);
      }

      orgId = orgsResult.rows[0].id as string;
      log(`   Found: ${orgsResult.rows[0].name} (${orgId})`, colors.green);
    }

    // 2. Get or find user
    if (!userId) {
      log("\n👤 Finding user...", colors.cyan);
      const usersResult = await db.execute(
        sql`SELECT id, name, email FROM users WHERE organization_id = ${orgId} ORDER BY created_at ASC LIMIT 1`
      );

      if (usersResult.rows.length === 0) {
        log("❌ No users found for this organization.", colors.red);
        process.exit(1);
      }

      userId = usersResult.rows[0].id as string;
      const userName = usersResult.rows[0].name || usersResult.rows[0].email;
      log(`   Found: ${userName} (${userId})`, colors.green);
    }

    // 3. Create API key with affiliate permissions
    log("\n🔑 Generating API key...", colors.cyan);

    const { apiKey, plainKey } = await apiKeysService.create({
      name: `Affiliate: ${affiliateName}`,
      description,
      user_id: userId,
      organization_id: orgId,
      permissions: ["affiliate:create-character"],
      rate_limit: rateLimit,
      is_active: true,
    });

    log("   ✅ API key created successfully!", colors.green);

    // 4. Display results
    log("\n" + "=".repeat(50), colors.bright);
    log("📋 API KEY DETAILS", colors.bright);
    log("=".repeat(50));

    log(`\n${colors.bright}Affiliate Name:${colors.reset}  ${affiliateName}`);
    log(`${colors.bright}API Key ID:${colors.reset}      ${apiKey.id}`);
    log(
      `${colors.bright}Key Prefix:${colors.reset}      ${apiKey.key_prefix}...`
    );
    log(
      `${colors.bright}Rate Limit:${colors.reset}      ${rateLimit} requests/hour`
    );
    log(
      `${colors.bright}Permissions:${colors.reset}     ${apiKey.permissions.join(", ")}`
    );
    log(
      `${colors.bright}Status:${colors.reset}          ${apiKey.is_active ? "✅ Active" : "❌ Inactive"}`
    );

    log(`\n${colors.yellow}${"=".repeat(50)}`, colors.yellow);
    log("⚠️  IMPORTANT: Save this API key now!", colors.yellow);
    log("   It will NOT be shown again.", colors.yellow);
    log("=".repeat(50), colors.yellow);

    log(`\n${colors.bright}API Key:${colors.reset}`);
    log(`${colors.green}${plainKey}${colors.reset}\n`);

    log("📝 Usage Example:", colors.cyan);
    log(
      `
curl -X POST ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/affiliate/create-character \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${plainKey}" \\
  -d '{
    "character": {
      "name": "Luna",
      "bio": ["A flirty and playful AI companion"],
      "style": {
        "all": ["Be flirty", "Be playful"],
        "chat": ["Use emojis", "Be engaging"]
      }
    },
    "affiliateId": "${affiliateName}"
  }'
    `.trim()
    );

    log(
      `\n✅ Done! Share this key with the ${affiliateName} team.\n`,
      colors.green
    );
  } catch (error) {
    log("\n❌ Error creating affiliate API key:", colors.red);
    console.error(error);
    process.exit(1);
  }
}

main();

