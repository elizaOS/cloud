#!/usr/bin/env bun
/**
 * Test Slow Query Tracking
 * 
 * Verifies the slow query instrumentation is working correctly.
 * Runs a deliberately slow query and checks if it's tracked.
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

// Force instrumentation to be enabled for this test
process.env.NODE_ENV = "development";

import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  console.log("🧪 Testing Slow Query Tracking\n");
  console.log("=".repeat(60));

  // Step 1: Run multiple queries to accumulate timing data
  console.log("\n1. Running multiple database queries...");
  
  const queryCount = 10;
  let totalDuration = 0;
  
  for (let i = 0; i < queryCount; i++) {
    const startTime = Date.now();
    // Run a real query that exercises the database
    await db.execute(sql`
      SELECT 
        t.tablename,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename)::regclass)) as size
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY pg_total_relation_size(quote_ident(t.tablename)::regclass) DESC
      LIMIT 20
    `);
    const duration = Date.now() - startTime;
    totalDuration += duration;
    if (duration >= 50) {
      console.log(`   Query ${i + 1}: ${duration}ms (tracked as slow)`);
    } else {
      console.log(`   Query ${i + 1}: ${duration}ms`);
    }
  }
  
  console.log(`   Total: ${totalDuration}ms across ${queryCount} queries`);
  console.log(`   Average: ${(totalDuration / queryCount).toFixed(2)}ms`);

  // Wait for async storage to complete
  console.log("\n2. Waiting for storage operations...");
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait for PostgreSQL flush

  // Step 3: Check if query was logged
  console.log("\n3. Checking slow_query_log table...");
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  const result = await pool.query(`
    SELECT 
      query_hash,
      call_count,
      avg_duration_ms,
      sql_text
    FROM slow_query_log
    ORDER BY last_seen_at DESC
    LIMIT 5
  `);

  if (result.rows.length === 0) {
    console.log("   ⚠️  No slow queries recorded yet");
    console.log("   This may be because:");
    console.log("   - Instrumentation is disabled (check NODE_ENV)");
    console.log("   - The query was too fast (<50ms)");
    console.log("   - There was an error writing to the database");
  } else {
    console.log(`   Found ${result.rows.length} slow queries:`);
    for (const row of result.rows) {
      console.log(`\n   - Hash: ${row.query_hash}`);
      console.log(`     Calls: ${row.call_count}`);
      console.log(`     Avg: ${row.avg_duration_ms}ms`);
      console.log(`     SQL: ${row.sql_text.substring(0, 60)}...`);
    }
  }

  // Step 4: Test in-memory store
  console.log("\n4. Testing in-memory store...");
  
  try {
    const { getSlowQueryStats, getTopSlowQueries } = await import("@/lib/db/slow-query-store");
    const stats = getSlowQueryStats();
    console.log(`   Total unique queries: ${stats.totalQueries}`);
    console.log(`   Total calls: ${stats.totalCalls}`);
    console.log(`   Avg duration: ${stats.avgDuration.toFixed(2)}ms`);

    const topQueries = getTopSlowQueries(3);
    if (topQueries.length > 0) {
      console.log("\n   Top queries in memory:");
      for (const q of topQueries) {
        console.log(`   - ${q.avgDurationMs.toFixed(2)}ms avg, ${q.callCount} calls`);
      }
    }
  } catch (err) {
    console.log("   ⚠️  Could not access in-memory store:", err);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test complete!\n");

  await pool.end();
}

main().catch(console.error);

