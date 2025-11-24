/**
 * Fix Drizzle Migration Tracking
 *
 * This script fixes the issue where `db:migrate` fails because the
 * __drizzle_migrations table doesn't exist (database was created via db:push).
 *
 * It creates the tracking table and marks all existing migrations as applied.
 *
 * Run with: bun run fix:drizzle-tracking
 */

import { config } from "dotenv";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });

interface MigrationEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationEntry[];
}

async function fixDrizzleMigrationTracking(): Promise<void> {
  console.log("🔧 Fixing Drizzle migration tracking...\n");

  try {
    // Step 1: Check if __drizzle_migrations exists
    console.log("📊 Checking migration tracking table...");
    const tableCheck = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    const trackingTableExists = tableCheck.rows[0]?.exists;

    if (trackingTableExists) {
      console.log("✅ Migration tracking table already exists");
      
      // Check what migrations are recorded
      const migrations = await db.execute(sql`
        SELECT * FROM __drizzle_migrations ORDER BY created_at
      `);
      
      console.log(`\nRecorded migrations: ${migrations.rows.length}`);
      migrations.rows.forEach((row: Record<string, string>) => {
        console.log(`  - ${row.hash}: ${row.created_at}`);
      });
    } else {
      console.log("⚠️  Migration tracking table does not exist");
      
      // Step 2: Create the tracking table
      console.log("\n🔨 Creating __drizzle_migrations table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);
      console.log("✅ Tracking table created");
    }

    // Step 3: Read migration journal
    console.log("\n📖 Reading migration journal...");
    const journalPath = join(process.cwd(), "db/migrations/meta/_journal.json");
    const journalContent = readFileSync(journalPath, "utf-8");
    const journal: MigrationJournal = JSON.parse(journalContent);

    console.log(`Found ${journal.entries.length} migrations in journal:`);
    journal.entries.forEach((entry) => {
      console.log(`  - ${entry.tag} (${new Date(entry.when).toISOString()})`);
    });

    // Step 4: Check which migrations are already recorded
    const recordedMigrations = await db.execute<{ hash: string }>(sql`
      SELECT hash FROM __drizzle_migrations
    `);
    
    const recordedHashes = new Set(
      recordedMigrations.rows.map((row) => row.hash)
    );

    // Step 5: Insert missing migrations
    console.log("\n📝 Marking migrations as applied...");
    let added = 0;
    
    for (const entry of journal.entries) {
      if (!recordedHashes.has(entry.tag)) {
        console.log(`  Adding: ${entry.tag}`);
        await db.execute(sql`
          INSERT INTO __drizzle_migrations (hash, created_at)
          VALUES (${entry.tag}, ${entry.when})
        `);
        added++;
      } else {
        console.log(`  Already recorded: ${entry.tag}`);
      }
    }

    if (added > 0) {
      console.log(`\n✅ Successfully marked ${added} migration(s) as applied`);
    } else {
      console.log("\n✅ All migrations already recorded");
    }

    // Step 6: Verify final state
    console.log("\n🔍 Verifying migration tracking...");
    const finalCount = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count FROM __drizzle_migrations
    `);
    
    console.log(`Total migrations tracked: ${finalCount.rows[0]?.count}`);

    // Step 7: Check critical tables exist
    console.log("\n🔍 Verifying critical tables exist...");
    const criticalTables = [
      "organizations",
      "users",
      "session_summaries",
      "user_characters",
      "api_keys",
    ];

    for (const tableName of criticalTables) {
      const exists = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as exists
      `);
      
      const status = exists.rows[0]?.exists ? "✅" : "❌";
      console.log(`  ${status} ${tableName}`);
    }

    console.log("\n✨ Migration tracking fix complete!");
    console.log("\n📝 Next steps:");
    console.log("  1. Use 'bun run db:push' for schema changes (recommended for development)");
    console.log("  2. Or use 'bun run db:migrate' which will now work correctly");
    console.log("  3. Run 'bun run fix:session-summaries' to prepare for room creation");
    console.log("  4. Restart your dev server and test room creation");

  } catch (error) {
    console.error("\n❌ Error fixing migration tracking:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixDrizzleMigrationTracking().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

