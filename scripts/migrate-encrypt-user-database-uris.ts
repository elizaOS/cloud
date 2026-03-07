/**
 * Migration Script: Encrypt Existing user_database_uri Values
 *
 * This script migrates existing plaintext user_database_uri values
 * to the encrypted format (enc:v1:...).
 *
 * Usage:
 *   npx tsx scripts/migrate-encrypt-user-database-uris.ts
 *
 * Prerequisites:
 *   - SECRETS_MASTER_KEY must be set in .env.local
 *   - DATABASE_URL must be set in .env.local
 *
 * This script is idempotent - it will skip already encrypted values.
 */

import { config } from "dotenv";
import { db } from "../db/client";
import { apps } from "../db/schemas/apps";
import { fieldEncryption } from "../lib/services/field-encryption";
import { and, isNotNull, not, like, eq } from "drizzle-orm";

// Load environment variables
config({ path: ".env.local" });

/** Condition for finding unencrypted URIs */
const UNENCRYPTED_URI_CONDITION = and(
  isNotNull(apps.user_database_uri),
  not(like(apps.user_database_uri, "enc:v1:%")),
);

interface MigrationResult {
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ appId: string; error: string }>;
}

/**
 * Migrate existing plaintext user_database_uri values to encrypted format.
 */
async function migrateEncryptUserDatabaseUris(): Promise<MigrationResult> {
  console.log("[ENCRYPT] Starting encryption migration for user_database_uri...\n");

  // Verify SECRETS_MASTER_KEY is set
  if (!process.env.SECRETS_MASTER_KEY) {
    console.error(
      "[ERROR] SECRETS_MASTER_KEY environment variable is not set.",
    );
    console.error("        Generate one with: openssl rand -hex 32");
    process.exit(1);
  }

  // Find all apps with non-encrypted URIs (not starting with "enc:v1:")
  const unencryptedApps = await db
    .select({
      id: apps.id,
      organization_id: apps.organization_id,
      user_database_uri: apps.user_database_uri,
      name: apps.name,
    })
    .from(apps)
    .where(UNENCRYPTED_URI_CONDITION);

  console.log(`[INFO] Found ${unencryptedApps.length} apps with unencrypted URIs\n`);

  if (unencryptedApps.length === 0) {
    console.log("[OK] No migration needed - all URIs are already encrypted!");
    return { migrated: 0, skipped: 0, failed: 0, errors: [] };
  }

  const result: MigrationResult = {
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const app of unencryptedApps) {
    const appId = app.id;
    const uri = app.user_database_uri;

    // Double-check it's not encrypted (defensive)
    if (!uri || fieldEncryption.isEncrypted(uri)) {
      result.skipped++;
      continue;
    }

    try {
      // Encrypt the URI
      const encryptedUri = await fieldEncryption.encrypt(
        app.organization_id,
        uri,
      );

      // Update the app record
      await db
        .update(apps)
        .set({
          user_database_uri: encryptedUri,
          updated_at: new Date(),
        })
        .where(eq(apps.id, appId));

      result.migrated++;

      // Progress indicator every 10 apps
      if (result.migrated % 10 === 0) {
        console.log(
          `   Progress: ${result.migrated}/${unencryptedApps.length} migrated...`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.failed++;
      result.errors.push({ appId, error: errorMessage });
      console.error(`   [FAIL] Failed to encrypt URI for app ${appId}: ${errorMessage}`);
    }
  }

  return result;
}

/**
 * Count remaining unencrypted URIs for verification.
 */
async function countUnencryptedUris(): Promise<number> {
  const remainingUnencrypted = await db
    .select({ id: apps.id })
    .from(apps)
    .where(UNENCRYPTED_URI_CONDITION);

  return remainingUnencrypted.length;
}

// Main execution
async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  user_database_uri Encryption Migration");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const result = await migrateEncryptUserDatabaseUris();

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  Migration Complete");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  [OK]   Migrated:  ${result.migrated}`);
    console.log(`  [SKIP] Skipped:   ${result.skipped}`);
    console.log(`  [FAIL] Failed:    ${result.failed}`);

    if (result.errors.length > 0) {
      console.log("\n  Failed Apps:");
      for (const err of result.errors) {
        console.log(`    - ${err.appId}: ${err.error}`);
      }
    }

    // Verify the migration
    console.log("\n[VERIFY] Verifying migration...");
    const remaining = await countUnencryptedUris();

    if (remaining === 0) {
      console.log("[OK] Verification passed: All URIs are now encrypted!");
    } else {
      console.log(
        `[WARN] ${remaining} URIs are still unencrypted. Please investigate.`,
      );
    }

    console.log("\n═══════════════════════════════════════════════════════════\n");

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n[ERROR] Migration failed with error:", error);
    process.exit(1);
  }
}

main();
