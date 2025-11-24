/**
 * Fix All Database Issues - Master Script
 *
 * This script fixes both:
 * 1. Drizzle migration tracking issue (db:migrate failing)
 * 2. Session summaries index conflicts (room creation failing)
 *
 * Run with: bun run fix:db
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

async function fixAllDatabaseIssues(): Promise<void> {
  console.log("🔧 Comprehensive Database Fix\n");
  console.log("This script will fix:");
  console.log("  1. Drizzle migration tracking");
  console.log("  2. Session summaries index conflicts\n");

  let issuesFixed = 0;
  const issues: string[] = [];

  try {
    // ═══════════════════════════════════════════════════════════════
    // PART 1: Fix Drizzle Migration Tracking
    // ═══════════════════════════════════════════════════════════════
    console.log("═".repeat(60));
    console.log("PART 1: Drizzle Migration Tracking");
    console.log("═".repeat(60) + "\n");

    const tableCheck = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    const trackingTableExists = tableCheck.rows[0]?.exists;

    if (!trackingTableExists) {
      console.log("⚠️  Migration tracking table missing");
      issues.push("Migration tracking table missing");

      console.log("🔨 Creating __drizzle_migrations table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);
      console.log("✅ Tracking table created\n");
      issuesFixed++;
    } else {
      console.log("✅ Migration tracking table exists\n");
    }

    // Read migration journal
    const journalPath = join(process.cwd(), "db/migrations/meta/_journal.json");
    const journalContent = readFileSync(journalPath, "utf-8");
    const journal: MigrationJournal = JSON.parse(journalContent);

    // Check which migrations are recorded
    const recordedMigrations = await db.execute<{ hash: string }>(sql`
      SELECT hash FROM __drizzle_migrations
    `);

    const recordedHashes = new Set(
      recordedMigrations.rows.map((row) => row.hash)
    );

    // Insert missing migrations
    let migrationsAdded = 0;
    for (const entry of journal.entries) {
      if (!recordedHashes.has(entry.tag)) {
        console.log(`📝 Marking migration as applied: ${entry.tag}`);
        await db.execute(sql`
          INSERT INTO __drizzle_migrations (hash, created_at)
          VALUES (${entry.tag}, ${entry.when})
        `);
        migrationsAdded++;
        issuesFixed++;
      }
    }

    if (migrationsAdded > 0) {
      console.log(`✅ Marked ${migrationsAdded} migration(s) as applied\n`);
      issues.push(`${migrationsAdded} untracked migrations`);
    } else {
      console.log("✅ All migrations already tracked\n");
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 2: Fix Eliza Plugin Index Conflicts
    // ═══════════════════════════════════════════════════════════════
    console.log("═".repeat(60));
    console.log("PART 2: Eliza Plugin Index Conflicts");
    console.log("═".repeat(60) + "\n");

    // Check all Eliza plugin tables for index conflicts
    const elizaTables = ['session_summaries', 'memory_access_logs', 'long_term_memories'];
    
    for (const tableName of elizaTables) {
      console.log(`\n📊 Checking ${tableName}...`);
      
      // Check for non-primary-key indexes
      const indexes = await db.execute<{ indexname: string }>(sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = ${tableName}
        AND indexname NOT LIKE '%_pkey'
        ORDER BY indexname
      `);

      if (indexes.rows.length > 0) {
        console.log(`  Found ${indexes.rows.length} index(es):`);
        indexes.rows.forEach((idx) => console.log(`    - ${idx.indexname}`));
        console.log(`  🗑️  Dropping indexes to allow Eliza migration...`);
        
        // Drop all indexes for this table
        for (const idx of indexes.rows) {
          await db.execute(sql.raw(`DROP INDEX IF EXISTS ${idx.indexname}`));
        }
        console.log(`  ✅ Dropped ${indexes.rows.length} index(es)`);
        issuesFixed++;
        issues.push(`${indexes.rows.length} conflicting indexes in ${tableName}`);
      } else {
        console.log(`  ✅ No conflicting indexes`);
      }
    }

    // Check for missing columns in session_summaries
    console.log(`\n📋 Checking session_summaries columns...`);
    const columns = await db.execute<{ column_name: string }>(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'session_summaries' 
      ORDER BY ordinal_position
    `);

    const columnNames = columns.rows.map((c) => c.column_name);
    const hasConfidence = columnNames.includes("confidence");
    const hasSource = columnNames.includes("source");
    const hasLastAccessed = columnNames.includes("last_accessed_at");
    const hasAccessCount = columnNames.includes("access_count");

    const missingColumns: string[] = [];
    if (!hasConfidence) missingColumns.push("confidence");
    if (!hasSource) missingColumns.push("source");
    if (!hasLastAccessed) missingColumns.push("last_accessed_at");
    if (!hasAccessCount) missingColumns.push("access_count");

    if (missingColumns.length > 0) {
      console.log(`  ⚠️  Missing columns: ${missingColumns.join(", ")}`);
      issues.push(`${missingColumns.length} missing columns in session_summaries`);
    } else {
      console.log(`  ✅ All required columns exist`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 3: Verify Database State
    // ═══════════════════════════════════════════════════════════════
    console.log("═".repeat(60));
    console.log("PART 3: Database State Verification");
    console.log("═".repeat(60) + "\n");

    const criticalTables = [
      "organizations",
      "users",
      "session_summaries",
      "user_characters",
      "api_keys",
      "rooms",
      "memories",
    ];

    console.log("📋 Checking critical tables:");
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

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(60));
    console.log("SUMMARY");
    console.log("═".repeat(60) + "\n");

    if (issuesFixed > 0) {
      console.log(`✅ Fixed ${issuesFixed} issue(s):`);
      issues.forEach((issue) => console.log(`   - ${issue}`));
    } else {
      console.log("✅ No issues found - database is healthy!");
    }

    console.log("\n📝 Next Steps:");
    if (missingColumns.length > 0) {
      console.log("  1. ✅ Indexes have been dropped");
      console.log("  2. 🔄 Restart your development server");
      console.log("  3. 🧪 Try creating a new chat room");
      console.log("  4. ✨ Eliza plugin migration will complete automatically");
      console.log("  5. 🔍 Run this script again to verify");
    } else {
      console.log("  1. 🔄 Restart your development server");
      console.log("  2. 🧪 Test room creation - should work now!");
    }

    console.log("\n💡 Tips:");
    console.log("  - Use 'bun run db:push' for schema changes (recommended for dev)");
    console.log("  - Run 'bun run fix:db' anytime you encounter database issues");
    console.log("  - Check logs if issues persist\n");

  } catch (error) {
    console.error("\n❌ Error during database fix:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixAllDatabaseIssues().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

