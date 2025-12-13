#!/usr/bin/env bun
/**
 * Database Health Check Script
 * 
 * Quick health check for database performance including:
 * - Slow query summary from in-memory store
 * - Redis cache status
 * - PostgreSQL slow query log stats
 * - Connection pool status
 * 
 * Usage:
 *   bun run scripts/db-health-check.ts
 *   bun run scripts/db-health-check.ts --detailed
 */

import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const detailed = args.includes("--detailed") || args.includes("-d");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

interface SlowQueryStats {
  total_queries: string;
  total_calls: string;
  avg_duration: string;
  max_duration: string;
  oldest_query: string;
  newest_query: string;
}

interface TopSlowQuery {
  query_hash: string;
  avg_duration_ms: string;
  max_duration_ms: string;
  call_count: string;
  sql_text: string;
  last_seen_at: string;
}

async function checkSlowQueryTable(): Promise<{
  exists: boolean;
  stats: SlowQueryStats | null;
  topQueries: TopSlowQuery[];
}> {
  // Check if table exists
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'slow_query_log'
    ) as exists
  `);

  if (!tableCheck.rows[0].exists) {
    return { exists: false, stats: null, topQueries: [] };
  }

  // Get stats
  const statsResult = await pool.query(`
    SELECT 
      count(*) as total_queries,
      coalesce(sum(call_count), 0) as total_calls,
      coalesce(round(avg(avg_duration_ms::numeric), 2), 0) as avg_duration,
      coalesce(max(max_duration_ms), 0) as max_duration,
      min(first_seen_at) as oldest_query,
      max(last_seen_at) as newest_query
    FROM slow_query_log
  `);

  // Get top slow queries
  const topQueriesResult = await pool.query(`
    SELECT 
      query_hash,
      round(avg_duration_ms::numeric, 2) as avg_duration_ms,
      max_duration_ms,
      call_count,
      left(sql_text, 200) as sql_text,
      last_seen_at
    FROM slow_query_log
    ORDER BY avg_duration_ms DESC
    LIMIT 10
  `);

  return {
    exists: true,
    stats: statsResult.rows[0],
    topQueries: topQueriesResult.rows,
  };
}

async function checkConnectionStats(): Promise<{
  total: number;
  active: number;
  idle: number;
}> {
  const result = await pool.query(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return result.rows[0];
}

async function checkRecentSeqScans(): Promise<Array<{
  relname: string;
  seq_scan: string;
  idx_scan: string;
  ratio: string;
}>> {
  const result = await pool.query(`
    SELECT 
      relname,
      seq_scan,
      idx_scan,
      CASE 
        WHEN (seq_scan + idx_scan) > 0 
        THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 2)::text || '%'
        ELSE '0%'
      END as ratio
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND (seq_scan + idx_scan) > 100
      AND seq_scan > idx_scan
    ORDER BY seq_scan DESC
    LIMIT 5
  `);
  return result.rows;
}

async function main() {
  console.log("🏥 Database Health Check");
  console.log("=".repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || "unknown"}`);
  console.log();

  // Connection stats
  console.log("📡 CONNECTION STATUS");
  console.log("-".repeat(60));
  const connStats = await checkConnectionStats();
  console.log(`  Total: ${connStats.total} | Active: ${connStats.active} | Idle: ${connStats.idle}`);
  console.log();

  // Slow query log
  console.log("📊 SLOW QUERY LOG");
  console.log("-".repeat(60));
  const slowQueryData = await checkSlowQueryTable();
  
  if (!slowQueryData.exists) {
    console.log("  ⚠️  slow_query_log table not found");
    console.log("  Run migration: bun run db:migrate");
  } else if (slowQueryData.stats) {
    const stats = slowQueryData.stats;
    console.log(`  Unique slow queries: ${stats.total_queries}`);
    console.log(`  Total slow calls: ${stats.total_calls}`);
    console.log(`  Average duration: ${stats.avg_duration}ms`);
    console.log(`  Max duration: ${stats.max_duration}ms`);
    
    if (stats.oldest_query) {
      console.log(`  First logged: ${new Date(stats.oldest_query).toLocaleString()}`);
      console.log(`  Last logged: ${new Date(stats.newest_query).toLocaleString()}`);
    }
  }
  console.log();

  // Top slow queries
  if (slowQueryData.topQueries.length > 0 && detailed) {
    console.log("🐌 TOP 10 SLOWEST QUERIES");
    console.log("-".repeat(60));
    
    for (let i = 0; i < slowQueryData.topQueries.length; i++) {
      const q = slowQueryData.topQueries[i];
      console.log();
      console.log(`  ${i + 1}. Avg: ${q.avg_duration_ms}ms | Max: ${q.max_duration_ms}ms | Calls: ${q.call_count}`);
      console.log(`     Last seen: ${new Date(q.last_seen_at).toLocaleString()}`);
      console.log(`     ${q.sql_text}${q.sql_text.length >= 200 ? "..." : ""}`);
    }
    console.log();
  }

  // High seq scan tables
  console.log("⚠️  TABLES WITH HIGH SEQUENTIAL SCANS");
  console.log("-".repeat(60));
  const seqScanTables = await checkRecentSeqScans();
  
  if (seqScanTables.length === 0) {
    console.log("  ✅ No tables with concerning sequential scan ratios");
  } else {
    console.log("  Table".padEnd(30) + "Seq Scans".padEnd(15) + "Idx Scans".padEnd(15) + "Ratio");
    console.log("  " + "-".repeat(55));
    for (const t of seqScanTables) {
      console.log(
        `  ${t.relname.padEnd(28)}${t.seq_scan.padEnd(15)}${t.idx_scan.padEnd(15)}${t.ratio}`
      );
    }
  }
  console.log();

  // Instrumentation status - use the actual function from db/client
  console.log("🔧 INSTRUMENTATION STATUS");
  console.log("-".repeat(60));
  
  // Dynamically import to get the actual instrumentation check
  const { isInstrumentationEnabled } = await import("@/db/client");
  const instrumentationEnabled = isInstrumentationEnabled();
  
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  
  console.log(`  Environment: ${env || "not set"} (VERCEL_ENV: ${vercelEnv || "not set"})`);
  console.log(`  Instrumentation: ${instrumentationEnabled ? "✅ ENABLED" : "❌ DISABLED"}`);
  console.log(`  Threshold: ${process.env.SLOW_QUERY_THRESHOLD_MS || "50"}ms`);
  
  const hasDiscord = !!process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
  const hasSlack = !!process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;
  console.log(`  Alerts: ${hasDiscord || hasSlack ? "✅ Configured" : "❌ Not configured"}`);
  if (hasDiscord) console.log("    - Discord webhook: ✅");
  if (hasSlack) console.log("    - Slack webhook: ✅");
  
  console.log();
  console.log("=".repeat(60));
  console.log("Health check complete!");
  
  if (!detailed) {
    console.log("\nTip: Run with --detailed for top slow queries");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Health check failed:", err);
  process.exit(1);
});

