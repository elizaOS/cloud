#!/usr/bin/env bun
// Runs k6 load tests while capturing slow queries for bottleneck identification
// Usage: bun run scripts/load-test-with-analysis.ts [smoke|stress|spike|soak|full-platform]

import { spawn } from "child_process";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

const SCENARIO = process.argv[2] || "smoke";
const VALID_SCENARIOS = [
  "smoke",
  "stress",
  "spike",
  "soak",
  "full-platform",
  "throughput",
];

if (!VALID_SCENARIOS.includes(SCENARIO)) {
  console.error(`Invalid scenario: ${SCENARIO}`);
  console.error(`Valid scenarios: ${VALID_SCENARIOS.join(", ")}`);
  process.exit(1);
}

interface SlowQuery {
  query_hash: string;
  sql_text: string;
  avg_duration_ms: number;
  max_duration_ms: number;
  call_count: number;
  total_duration_ms: number;
}

async function getSlowQueriesSnapshot(): Promise<Map<string, SlowQuery>> {
  const result = await db.execute(sql`
    SELECT query_hash, sql_text, avg_duration_ms::float as avg_duration_ms, 
           max_duration_ms, call_count, total_duration_ms::bigint as total_duration_ms
    FROM slow_query_log
  `);

  const map = new Map<string, SlowQuery>();
  for (const row of result.rows as SlowQuery[]) {
    map.set(row.query_hash, row);
  }
  return map;
}

async function runLoadTest(): Promise<void> {
  return new Promise((resolve, reject) => {
    const command =
      SCENARIO === "full-platform" ? "load:local" : `load:${SCENARIO}`;
    console.log(`\n🔥 Running: bun run ${command}\n`);

    const proc = spawn("bun", ["run", command], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env },
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Load test exited with code ${code}`));
    });

    proc.on("error", reject);
  });
}

async function analyzeBottlenecks(
  before: Map<string, SlowQuery>,
  after: Map<string, SlowQuery>,
): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log(
    "📊 SLOW QUERY ANALYSIS - BOTTLENECKS IDENTIFIED DURING LOAD TEST",
  );
  console.log("=".repeat(80));

  const newQueries: SlowQuery[] = [];
  const worsened: { query: SlowQuery; callsDelta: number; avgDelta: number }[] =
    [];

  for (const [hash, afterQuery] of after) {
    const beforeQuery = before.get(hash);

    if (!beforeQuery) {
      newQueries.push(afterQuery);
    } else {
      const callsDelta = afterQuery.call_count - beforeQuery.call_count;
      const avgDelta = afterQuery.avg_duration_ms - beforeQuery.avg_duration_ms;

      if (callsDelta > 0 || avgDelta > 10) {
        worsened.push({ query: afterQuery, callsDelta, avgDelta });
      }
    }
  }

  // Sort by impact (total new duration)
  newQueries.sort((a, b) => b.total_duration_ms - a.total_duration_ms);
  worsened.sort(
    (a, b) =>
      b.callsDelta * b.query.avg_duration_ms -
      a.callsDelta * a.query.avg_duration_ms,
  );

  if (newQueries.length === 0 && worsened.length === 0) {
    console.log("\n✅ No significant slow queries detected during load test!");
    console.log("   Your caching and optimization efforts are working well.\n");
    return;
  }

  if (newQueries.length > 0) {
    console.log("\n🆕 NEW SLOW QUERIES (not seen before load test):");
    console.log("-".repeat(80));

    for (const q of newQueries.slice(0, 10)) {
      console.log(`\n  Hash: ${q.query_hash}`);
      console.log(
        `  Avg: ${q.avg_duration_ms.toFixed(0)}ms | Max: ${q.max_duration_ms}ms | Calls: ${q.call_count}`,
      );
      console.log(`  SQL: ${q.sql_text.substring(0, 200)}...`);
    }
  }

  if (worsened.length > 0) {
    console.log("\n📈 QUERIES WITH INCREASED LOAD:");
    console.log("-".repeat(80));

    for (const { query, callsDelta, avgDelta } of worsened.slice(0, 10)) {
      console.log(`\n  Hash: ${query.query_hash}`);
      console.log(
        `  Calls: +${callsDelta} | Avg: ${query.avg_duration_ms.toFixed(0)}ms (${avgDelta > 0 ? "+" : ""}${avgDelta.toFixed(0)}ms)`,
      );
      console.log(`  SQL: ${query.sql_text.substring(0, 200)}...`);
    }
  }

  // Recommendations
  const highFrequency = [
    ...worsened,
    ...newQueries.map((q) => ({
      query: q,
      callsDelta: q.call_count,
      avgDelta: 0,
    })),
  ]
    .filter((w) => w.callsDelta > 10)
    .slice(0, 5);

  const slowest = [...after.values()]
    .filter((q) => q.avg_duration_ms > 100)
    .sort((a, b) => b.avg_duration_ms - a.avg_duration_ms)
    .slice(0, 5);

  if (highFrequency.length > 0 || slowest.length > 0) {
    console.log("\n💡 RECOMMENDATIONS:");
    for (const { query } of highFrequency) {
      if (query.sql_text.toLowerCase().includes("select")) {
        console.log(`   Cache: ${query.query_hash}`);
      }
    }
    for (const q of slowest) {
      console.log(
        `   Optimize: ${q.query_hash} (${q.avg_duration_ms.toFixed(0)}ms)`,
      );
    }
  }
  console.log();
}

async function main() {
  console.log(`\n🔥 Load Test with Analysis (scenario: ${SCENARIO})\n`);
  console.log("📸 Taking slow query snapshot before load test...");
  const beforeSnapshot = await getSlowQueriesSnapshot();
  console.log(`   Found ${beforeSnapshot.size} existing slow query patterns`);

  // Run load test
  try {
    await runLoadTest();
  } catch (error) {
    console.error("\n❌ Load test failed:", error);
    // Continue with analysis even if load test fails
  }

  console.log("\n⏳ Waiting for flush...");
  await new Promise((resolve) => setTimeout(resolve, 6000));

  console.log("📸 Taking post-test snapshot...");
  const afterSnapshot = await getSlowQueriesSnapshot();
  console.log(
    `   Found ${afterSnapshot.size} slow query patterns (${afterSnapshot.size - beforeSnapshot.size} new)`,
  );

  // Analyze
  await analyzeBottlenecks(beforeSnapshot, afterSnapshot);

  process.exit(0);
}

main().catch(console.error);
