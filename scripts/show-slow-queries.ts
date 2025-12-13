#!/usr/bin/env bun
/**
 * Show Slow Queries Script
 * 
 * Displays slow queries from the PostgreSQL slow_query_log table.
 * 
 * Usage:
 *   bun run scripts/show-slow-queries.ts              # Top 20 by avg duration
 *   bun run scripts/show-slow-queries.ts --frequent   # Top 20 by call count
 *   bun run scripts/show-slow-queries.ts --recent     # Most recent slow queries
 *   bun run scripts/show-slow-queries.ts --full       # Show full SQL
 *   bun run scripts/show-slow-queries.ts --limit=50   # Change limit
 */

import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const frequent = args.includes("--frequent") || args.includes("-f");
const recent = args.includes("--recent") || args.includes("-r");
const fullSql = args.includes("--full");

const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 20;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  // Check if table exists
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'slow_query_log'
    ) as exists
  `);

  if (!tableCheck.rows[0].exists) {
    console.log("❌ slow_query_log table not found");
    console.log("\nRun the migration to create it:");
    console.log("  bun run db:migrate");
    await pool.end();
    process.exit(1);
  }

  // Build query based on args
  let orderBy = "avg_duration_ms DESC";
  let title = "TOP SLOW QUERIES BY AVERAGE DURATION";

  if (frequent) {
    orderBy = "call_count DESC";
    title = "MOST FREQUENT SLOW QUERIES";
  } else if (recent) {
    orderBy = "last_seen_at DESC";
    title = "MOST RECENT SLOW QUERIES";
  }

  const result = await pool.query(`
    SELECT 
      query_hash,
      round(avg_duration_ms::numeric, 2) as avg_ms,
      min_duration_ms as min_ms,
      max_duration_ms as max_ms,
      call_count,
      sql_text,
      source_file,
      source_function,
      first_seen_at,
      last_seen_at
    FROM slow_query_log
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `);

  console.log("\n" + "=".repeat(80));
  console.log(`📊 ${title}`);
  console.log("=".repeat(80));
  console.log(`Showing ${result.rows.length} queries (limit: ${limit})`);
  console.log();

  if (result.rows.length === 0) {
    console.log("No slow queries recorded yet! 🎉");
    console.log("\nSlow queries (>${process.env.SLOW_QUERY_THRESHOLD_MS || 50}ms) will be logged automatically");
    console.log("when running in development or staging mode.");
    await pool.end();
    return;
  }

  for (let i = 0; i < result.rows.length; i++) {
    const q = result.rows[i];
    
    console.log("-".repeat(80));
    console.log(`#${i + 1} | Hash: ${q.query_hash}`);
    console.log();
    console.log(`  Duration:  avg=${q.avg_ms}ms  min=${q.min_ms}ms  max=${q.max_ms}ms`);
    console.log(`  Calls:     ${q.call_count}`);
    
    if (q.source_file || q.source_function) {
      console.log(`  Source:    ${q.source_file || "unknown"}:${q.source_function || "unknown"}`);
    }
    
    console.log(`  First:     ${new Date(q.first_seen_at).toLocaleString()}`);
    console.log(`  Last:      ${new Date(q.last_seen_at).toLocaleString()}`);
    console.log();
    
    if (fullSql) {
      console.log("  SQL:");
      console.log("  " + "-".repeat(76));
      const lines = q.sql_text.split("\n");
      for (const line of lines) {
        console.log("  " + line);
      }
    } else {
      const preview = q.sql_text.substring(0, 200).replace(/\s+/g, " ");
      console.log(`  SQL: ${preview}${q.sql_text.length > 200 ? "..." : ""}`);
    }
    console.log();
  }

  console.log("=".repeat(80));
  console.log("\nOptions:");
  console.log("  --frequent  Sort by call count");
  console.log("  --recent    Sort by last seen");
  console.log("  --full      Show full SQL text");
  console.log("  --limit=N   Change limit (default: 20)");

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to fetch slow queries:", err);
  process.exit(1);
});

