/**
 * Verify Database State - Comprehensive Check
 *
 * This script verifies the complete database state including:
 * - All Eliza plugin tables exist
 * - Expected columns are present
 * - Index state is correct
 * - Migration tracking is set up
 *
 * Run with: bun run verify:db
 */

import { config } from "dotenv";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableIndex {
  indexname: string;
  indexdef: string;
}

async function verifyDatabaseState(): Promise<void> {
  console.log("🔍 Comprehensive Database State Verification\n");
  console.log("═".repeat(70) + "\n");

  let issues = 0;
  let warnings = 0;

  try {
    // ═══════════════════════════════════════════════════════════════
    // PART 1: Migration Tracking
    // ═══════════════════════════════════════════════════════════════
    console.log("📋 MIGRATION TRACKING");
    console.log("─".repeat(70));

    const trackingExists = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    if (trackingExists.rows[0]?.exists) {
      const migrations = await db.execute<{ hash: string; created_at: string }>(sql`
        SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at
      `);
      console.log(`✅ Migration tracking table exists`);
      console.log(`   Tracked migrations: ${migrations.rows.length}`);
      migrations.rows.forEach((m) => console.log(`     - ${m.hash}`));
    } else {
      console.log(`❌ Migration tracking table missing`);
      issues++;
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 2: Eliza Plugin Tables
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n📋 ELIZA PLUGIN TABLES`);
    console.log("─".repeat(70));

    const elizaTables = [
      { name: "session_summaries", expectedColumns: 18, requiredExtra: ["confidence", "source", "last_accessed_at", "access_count"] },
      { name: "memory_access_logs", expectedColumns: 8, requiredExtra: [] },
      { name: "long_term_memories", expectedColumns: 13, requiredExtra: [] },
    ];

    for (const table of elizaTables) {
      console.log(`\n🔍 ${table.name}`);

      // Check if table exists
      const tableExists = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${table.name}
        ) as exists
      `);

      if (!tableExists.rows[0]?.exists) {
        console.log(`  ❌ Table does not exist`);
        issues++;
        continue;
      }

      // Check columns
      const columns = await db.execute<TableColumn>(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = ${table.name}
        ORDER BY ordinal_position
      `);

      console.log(`  📊 Columns: ${columns.rows.length}`);

      // Check for required extra columns
      if (table.requiredExtra.length > 0) {
        const columnNames = columns.rows.map((c) => c.column_name);
        const missing = table.requiredExtra.filter((col) => !columnNames.includes(col));
        
        if (missing.length > 0) {
          console.log(`  ⚠️  Missing columns: ${missing.join(", ")}`);
          console.log(`     (These will be added by Eliza migration on first room creation)`);
          warnings++;
        } else {
          console.log(`  ✅ All required columns present`);
        }
      }

      // List all columns
      console.log(`     ${columns.rows.map((c) => c.column_name).join(", ")}`);

      // Check indexes
      const indexes = await db.execute<TableIndex>(sql`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = ${table.name}
        ORDER BY indexname
      `);

      const nonPkIndexes = indexes.rows.filter((idx) => !idx.indexname.endsWith("_pkey"));
      
      console.log(`  📑 Indexes: ${indexes.rows.length} total`);
      indexes.rows.forEach((idx) => {
        const isPk = idx.indexname.endsWith("_pkey");
        const status = isPk ? "🔑" : (nonPkIndexes.length > 0 && table.requiredExtra.length > 0 ? "⚠️ " : "📌");
        console.log(`     ${status} ${idx.indexname}`);
      });

      if (nonPkIndexes.length > 0 && table.requiredExtra.length > 0) {
        const missingCols = table.requiredExtra.filter((col) => 
          !columns.rows.map((c) => c.column_name).includes(col)
        );
        if (missingCols.length > 0) {
          console.log(`  ⚠️  WARNING: Table has indexes but missing columns!`);
          console.log(`     This will cause migration to fail. Run: bun run fix:db`);
          issues++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 3: Critical Application Tables
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n📋 CRITICAL APPLICATION TABLES`);
    console.log("─".repeat(70));

    const criticalTables = [
      "organizations", "users", "user_characters", "api_keys",
      "rooms", "participants", "memories", "agents", "entities"
    ];

    let allPresent = true;
    for (const tableName of criticalTables) {
      const exists = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as exists
      `);

      const status = exists.rows[0]?.exists ? "✅" : "❌";
      if (!exists.rows[0]?.exists) {
        allPresent = false;
        issues++;
      }
      console.log(`  ${status} ${tableName}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${"═".repeat(70)}`);
    console.log("SUMMARY");
    console.log("═".repeat(70) + "\n");

    if (issues === 0 && warnings === 0) {
      console.log("✅ DATABASE IS HEALTHY!");
      console.log("   All tables exist, columns are present, and indexes are correct.\n");
      console.log("📝 Next Steps:");
      console.log("   1. Start your development server: bun run dev");
      console.log("   2. Test room creation");
      console.log("   3. First room creation will trigger Eliza migration");
      console.log("   4. Run this script again to verify migration completed\n");
    } else if (issues === 0 && warnings > 0) {
      console.log(`⚠️  DATABASE HAS ${warnings} WARNING(S)`);
      console.log("   Database is functional but Eliza migration needs to run.\n");
      console.log("📝 Next Steps:");
      console.log("   1. Indexes have been dropped (if any conflicted)");
      console.log("   2. Start your development server: bun run dev");
      console.log("   3. Create a new chat room to trigger Eliza migration");
      console.log("   4. Migration will add missing columns and indexes");
      console.log("   5. Run this script again to verify\n");
    } else {
      console.log(`❌ DATABASE HAS ${issues} ISSUE(S) and ${warnings} WARNING(S)`);
      console.log("   Please fix these issues before continuing.\n");
      console.log("📝 Recommended Action:");
      console.log("   Run: bun run fix:db\n");
    }

    // Show quick reference
    console.log("💡 Quick Reference:");
    console.log("   bun run fix:db       - Fix all database issues");
    console.log("   bun run verify:db    - Run this verification again");
    console.log("   bun run dev          - Start development server\n");

  } catch (error) {
    console.error("\n❌ Error during verification:", error);
    throw error;
  } finally {
    process.exit(issues > 0 ? 1 : 0);
  }
}

// Run verification
verifyDatabaseState().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

