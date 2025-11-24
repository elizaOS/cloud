/**
 * Fix Session Summaries Index Conflict
 *
 * This script drops and recreates indexes on the session_summaries table
 * to resolve migration conflicts with the Eliza plugin-sql adapter.
 *
 * Run with: bun run scripts/fix-session-summaries-indexes.ts
 */

import { config } from "dotenv";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

async function fixSessionSummariesIndexes(): Promise<void> {
  console.log("🔧 Starting session_summaries index fix...\n");

  try {
    // Step 1: Check current table structure
    console.log("📊 Checking current table structure...");
    const columns = await db.execute<{ column_name: string; data_type: string }>(
      sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'session_summaries' 
        ORDER BY ordinal_position
      `
    );

    console.log(`Found ${columns.rows.length} columns in session_summaries:`);
    columns.rows.forEach((col) => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    // Check if new columns exist
    const hasConfidence = columns.rows.some((c) => c.column_name === "confidence");
    const hasSource = columns.rows.some((c) => c.column_name === "source");
    const hasLastAccessed = columns.rows.some((c) => c.column_name === "last_accessed_at");
    const hasAccessCount = columns.rows.some((c) => c.column_name === "access_count");

    if (hasConfidence && hasSource && hasLastAccessed && hasAccessCount) {
      console.log("\n✅ All expected columns exist. Checking indexes...");
    } else {
      console.log("\n⚠️  Missing expected columns. Migration may need to run.");
      if (!hasConfidence) console.log("  - Missing: confidence");
      if (!hasSource) console.log("  - Missing: source");
      if (!hasLastAccessed) console.log("  - Missing: last_accessed_at");
      if (!hasAccessCount) console.log("  - Missing: access_count");
    }

    // Step 2: Check current indexes
    console.log("\n📋 Checking current indexes...");
    const indexes = await db.execute<{ indexname: string }>(
      sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'session_summaries'
        ORDER BY indexname
      `
    );

    console.log(`Found ${indexes.rows.length} indexes:`);
    indexes.rows.forEach((idx) => {
      console.log(`  - ${idx.indexname}`);
    });

    const hasAgentRoomIdx = indexes.rows.some(
      (idx) => idx.indexname === "session_summaries_agent_room_idx"
    );
    const hasEntityIdx = indexes.rows.some(
      (idx) => idx.indexname === "session_summaries_entity_idx"
    );
    const hasStartTimeIdx = indexes.rows.some(
      (idx) => idx.indexname === "session_summaries_start_time_idx"
    );

    // Step 3: Drop problematic indexes if columns are missing
    if (!hasConfidence || !hasSource || !hasLastAccessed || !hasAccessCount) {
      console.log("\n🗑️  Dropping indexes to allow migration to complete...");

      if (hasAgentRoomIdx) {
        console.log("  Dropping session_summaries_agent_room_idx...");
        await db.execute(
          sql`DROP INDEX IF EXISTS session_summaries_agent_room_idx`
        );
      }

      if (hasEntityIdx) {
        console.log("  Dropping session_summaries_entity_idx...");
        await db.execute(sql`DROP INDEX IF EXISTS session_summaries_entity_idx`);
      }

      if (hasStartTimeIdx) {
        console.log("  Dropping session_summaries_start_time_idx...");
        await db.execute(
          sql`DROP INDEX IF EXISTS session_summaries_start_time_idx`
        );
      }

      console.log("\n✅ Indexes dropped successfully!");
      console.log("\n📝 Next steps:");
      console.log("   1. Restart your development server");
      console.log("   2. Try creating a new chat room");
      console.log("   3. The Eliza plugin migration should now complete successfully");
      console.log("   4. Run this script again to verify all columns and indexes exist");
    } else if (
      !hasAgentRoomIdx ||
      !hasEntityIdx ||
      !hasStartTimeIdx
    ) {
      console.log("\n🔨 Recreating missing indexes...");

      if (!hasAgentRoomIdx) {
        console.log("  Creating session_summaries_agent_room_idx...");
        await db.execute(
          sql`CREATE INDEX session_summaries_agent_room_idx 
              ON session_summaries (agent_id, room_id)`
        );
      }

      if (!hasEntityIdx) {
        console.log("  Creating session_summaries_entity_idx...");
        await db.execute(
          sql`CREATE INDEX session_summaries_entity_idx 
              ON session_summaries (entity_id)`
        );
      }

      if (!hasStartTimeIdx) {
        console.log("  Creating session_summaries_start_time_idx...");
        await db.execute(
          sql`CREATE INDEX session_summaries_start_time_idx 
              ON session_summaries (start_time)`
        );
      }

      console.log("\n✅ Indexes recreated successfully!");
    } else {
      console.log("\n✅ All columns and indexes are present. No action needed!");
    }

    console.log("\n🎉 Done!");
  } catch (error) {
    console.error("\n❌ Error fixing session_summaries indexes:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixSessionSummariesIndexes().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

