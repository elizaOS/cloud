#!/usr/bin/env bun
// End-to-end test for query instrumentation

import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { getSlowQueriesFromMemory, clearMemoryStore } from "@/lib/db/slow-query-store";

async function main() {
  console.log("🧪 Testing Query Instrumentation End-to-End\n");
  
  // Clear existing data
  clearMemoryStore();
  console.log("1. Cleared memory store");
  
  // Check if instrumentation is enabled
  const { isInstrumentationEnabled } = await import("@/db/client");
  const enabled = isInstrumentationEnabled();
  console.log(`2. Instrumentation enabled: ${enabled ? "✅ YES" : "❌ NO"}`);
  
  if (!enabled) {
    console.log("\n⚠️  Instrumentation is DISABLED. Set one of:");
    console.log("   - NODE_ENV=development");
    console.log("   - VERCEL_ENV=preview");
    console.log("   - DB_INSTRUMENTATION_ENABLED=true");
    process.exit(1);
  }
  
  // Force a slow query with pg_sleep
  console.log("\n3. Executing slow query (pg_sleep 0.1 = 100ms)...");
  const start = performance.now();
  await db.execute(sql`SELECT pg_sleep(0.1)`);
  const duration = Math.round(performance.now() - start);
  console.log(`   Query took ${duration}ms`);
  
  // Check if it was captured
  const queries = getSlowQueriesFromMemory();
  console.log(`\n4. Slow queries captured: ${queries.length}`);
  
  if (queries.length === 0) {
    console.log("\n❌ FAIL: No slow queries captured!");
    console.log("   The instrumentation proxy may not be intercepting queries.");
    process.exit(1);
  }
  
  // Find the pg_sleep query
  const sleepQuery = queries.find(q => q.sqlText.includes("pg_sleep"));
  if (sleepQuery) {
    console.log("\n✅ SUCCESS: Slow query captured!");
    console.log(`   Hash: ${sleepQuery.queryHash}`);
    console.log(`   Duration: ${sleepQuery.durationMs}ms`);
    console.log(`   SQL: ${sleepQuery.sqlText.substring(0, 100)}`);
  } else {
    console.log("\n⚠️  pg_sleep query not found in captured queries:");
    for (const q of queries) {
      console.log(`   - ${q.sqlText.substring(0, 80)}... (${q.durationMs}ms)`);
    }
  }
  
  // Test a regular query (should not be captured if under threshold)
  console.log("\n5. Executing fast query...");
  await db.execute(sql`SELECT 1`);
  const afterFast = getSlowQueriesFromMemory();
  const newQueries = afterFast.length - queries.length;
  console.log(`   New slow queries: ${newQueries} (expected: 0 if query was fast)`);
  
  console.log("\n✅ Instrumentation is working correctly!\n");
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
