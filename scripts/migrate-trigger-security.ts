/**
 * Migration Script: Add Security Fields to Existing Triggers
 * 
 * This script updates existing webhook triggers to have:
 * - webhookSecret (auto-generated if missing)
 * - requireSignature (default: true)
 * - maxExecutionsPerDay (default: 10000)
 * 
 * Run with: bun run scripts/migrate-trigger-security.ts
 * 
 * IMPORTANT: Run this ONCE after deploying the security updates.
 * The script is idempotent - running it multiple times is safe.
 */

import { db } from "@/db/client";
import { n8nWorkflowTriggers } from "@/db/schemas/n8n-workflows";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

interface TriggerConfig {
  webhookSecret?: string;
  requireSignature?: boolean;
  maxExecutionsPerDay?: number;
  [key: string]: unknown;
}

async function migrateTriggerSecurity() {
  console.log("🔐 Starting trigger security migration...\n");

  // Get all webhook triggers
  const webhookTriggers = await db
    .select()
    .from(n8nWorkflowTriggers)
    .where(eq(n8nWorkflowTriggers.trigger_type, "webhook"));

  console.log(`Found ${webhookTriggers.length} webhook triggers to check.\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const trigger of webhookTriggers) {
    const config = trigger.config as TriggerConfig;
    const updates: Partial<TriggerConfig> = {};
    let needsUpdate = false;

    // Add webhook secret if missing
    if (!config.webhookSecret) {
      updates.webhookSecret = randomBytes(32).toString("hex");
      needsUpdate = true;
      console.log(`  [${trigger.id.slice(0, 8)}...] Adding webhook secret`);
    }

    // Add requireSignature if not set
    if (config.requireSignature === undefined) {
      updates.requireSignature = true;
      needsUpdate = true;
      console.log(`  [${trigger.id.slice(0, 8)}...] Setting requireSignature=true`);
    }

    // Add maxExecutionsPerDay if not set
    if (!config.maxExecutionsPerDay) {
      updates.maxExecutionsPerDay = 10000;
      needsUpdate = true;
      console.log(`  [${trigger.id.slice(0, 8)}...] Setting maxExecutionsPerDay=10000`);
    }

    if (needsUpdate) {
      try {
        const newConfig = { ...config, ...updates };
        
        await db
          .update(n8nWorkflowTriggers)
          .set({ 
            config: newConfig,
            updated_at: new Date(),
          })
          .where(eq(n8nWorkflowTriggers.id, trigger.id));

        updated++;
        console.log(`  ✅ Updated trigger ${trigger.id.slice(0, 8)}...\n`);
      } catch (error) {
        errors++;
        console.error(`  ❌ Error updating trigger ${trigger.id}:`, error);
      }
    } else {
      skipped++;
      console.log(`  ⏭️  Trigger ${trigger.id.slice(0, 8)}... already has security fields\n`);
    }
  }

  // Also update cron triggers with execution limits
  const cronTriggers = await db
    .select()
    .from(n8nWorkflowTriggers)
    .where(eq(n8nWorkflowTriggers.trigger_type, "cron"));

  console.log(`\nFound ${cronTriggers.length} cron triggers to check.\n`);

  for (const trigger of cronTriggers) {
    const config = trigger.config as TriggerConfig;

    if (!config.maxExecutionsPerDay) {
      try {
        const newConfig = { ...config, maxExecutionsPerDay: 1440 }; // 1 per minute max
        
        await db
          .update(n8nWorkflowTriggers)
          .set({ 
            config: newConfig,
            updated_at: new Date(),
          })
          .where(eq(n8nWorkflowTriggers.id, trigger.id));

        updated++;
        console.log(`  ✅ Updated cron trigger ${trigger.id.slice(0, 8)}... with execution limit\n`);
      } catch (error) {
        errors++;
        console.error(`  ❌ Error updating cron trigger ${trigger.id}:`, error);
      }
    } else {
      skipped++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Migration Complete!");
  console.log("=".repeat(50));
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);
  console.log("=".repeat(50) + "\n");

  if (errors > 0) {
    console.log("⚠️  Some triggers failed to update. Check the errors above.");
    process.exit(1);
  }

  console.log("✅ All triggers now have security fields configured.");
  console.log("\n📝 IMPORTANT: Existing webhook callers will need to update their");
  console.log("   integrations to include signature headers if requireSignature=true.\n");
  
  process.exit(0);
}

// Run the migration
migrateTriggerSecurity().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

