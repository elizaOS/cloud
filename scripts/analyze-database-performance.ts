#!/usr/bin/env bun
/**
 * Database Performance Analysis Script
 * 
 * Analyzes PostgreSQL for:
 * - Table statistics (sizes, row counts, dead tuples)
 * - Index usage and effectiveness
 * - Sequential scan detection (potential missing indexes)
 * - pg_stat_statements if available (actual slow queries)
 * - Lock contention
 * - Connection stats
 */

import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

interface TableStats {
  schemaname: string;
  relname: string;
  n_live_tup: string;
  n_dead_tup: string;
  seq_scan: string;
  seq_tup_read: string;
  idx_scan: string;
  idx_tup_fetch: string;
  n_tup_ins: string;
  n_tup_upd: string;
  n_tup_del: string;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
}

interface IndexStats {
  schemaname: string;
  relname: string;
  indexrelname: string;
  idx_scan: string;
  idx_tup_read: string;
  idx_tup_fetch: string;
  idx_size: string;
}

interface TableSize {
  table_name: string;
  total_size: string;
  table_size: string;
  index_size: string;
  row_estimate: string;
}

interface SlowQuery {
  query: string;
  calls: string;
  total_time: string;
  mean_time: string;
  max_time: string;
  rows: string;
}

interface SeqScanTable {
  relname: string;
  seq_scan: string;
  seq_tup_read: string;
  idx_scan: string;
  seq_scan_ratio: string;
}

async function checkPgStatStatements(): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) as exists
  `);
  return result.rows[0].exists;
}

async function getTableStats(): Promise<TableStats[]> {
  const result = await pool.query(`
    SELECT 
      schemaname,
      relname,
      n_live_tup,
      n_dead_tup,
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch,
      n_tup_ins,
      n_tup_upd,
      n_tup_del,
      last_vacuum,
      last_autovacuum,
      last_analyze
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC
  `);
  return result.rows;
}

async function getIndexStats(): Promise<IndexStats[]> {
  const result = await pool.query(`
    SELECT 
      schemaname,
      relname,
      indexrelname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as idx_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan DESC
  `);
  return result.rows;
}

async function getUnusedIndexes(): Promise<IndexStats[]> {
  const result = await pool.query(`
    SELECT 
      schemaname,
      relname,
      indexrelname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as idx_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND idx_scan = 0
      AND indexrelname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(indexrelid) DESC
  `);
  return result.rows;
}

async function getTableSizes(): Promise<TableSize[]> {
  const result = await pool.query(`
    SELECT 
      relname as table_name,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_size_pretty(pg_relation_size(relid)) as table_size,
      pg_size_pretty(pg_indexes_size(relid)) as index_size,
      n_live_tup as row_estimate
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 30
  `);
  return result.rows;
}

async function getSlowQueries(): Promise<SlowQuery[]> {
  const hasPgStatStatements = await checkPgStatStatements();
  if (!hasPgStatStatements) {
    return [];
  }

  const result = await pool.query(`
    SELECT 
      query,
      calls,
      round(total_exec_time::numeric, 2) as total_time,
      round(mean_exec_time::numeric, 2) as mean_time,
      round(max_exec_time::numeric, 2) as max_time,
      rows
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND mean_exec_time > 50
    ORDER BY mean_exec_time DESC
    LIMIT 30
  `);
  return result.rows;
}

async function getHighSeqScanTables(): Promise<SeqScanTable[]> {
  const result = await pool.query(`
    SELECT 
      relname,
      seq_scan,
      seq_tup_read,
      idx_scan,
      CASE 
        WHEN (seq_scan + idx_scan) > 0 
        THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 2)
        ELSE 0 
      END as seq_scan_ratio
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND (seq_scan + idx_scan) > 100
      AND seq_scan > idx_scan
    ORDER BY seq_tup_read DESC
    LIMIT 20
  `);
  return result.rows;
}

async function getMissingIndexCandidates(): Promise<Array<{ table: string; column: string; reason: string }>> {
  // Check for foreign key columns without indexes
  const fkResult = await pool.query(`
    SELECT 
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = tc.table_name
          AND indexdef LIKE '%' || kcu.column_name || '%'
      )
  `);

  return fkResult.rows.map((row: { table_name: string; column_name: string; foreign_table: string }) => ({
    table: row.table_name,
    column: row.column_name,
    reason: `Foreign key to ${row.foreign_table} without index`,
  }));
}

async function getConnectionStats(): Promise<{
  total: number;
  active: number;
  idle: number;
  waiting: number;
}> {
  const result = await pool.query(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return result.rows[0];
}

async function getLockContention(): Promise<Array<{
  blocked_query: string;
  blocking_query: string;
  blocked_duration: string;
}>> {
  const result = await pool.query(`
    SELECT 
      blocked_activity.query AS blocked_query,
      blocking_activity.query AS blocking_query,
      now() - blocked_activity.query_start AS blocked_duration
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity 
      ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks 
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
      AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
      AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
      AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
      AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
      AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
      AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
      AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
      AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
      AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity 
      ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted
    LIMIT 10
  `);
  return result.rows;
}

async function getIndexDefinitions(): Promise<Array<{
  tablename: string;
  indexname: string;
  indexdef: string;
}>> {
  const result = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  return result.rows;
}

async function analyzeQueryPatterns(): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("🔍 ANALYZING COMMON QUERY PATTERNS FROM CODEBASE");
  console.log("=".repeat(80));

  // Tables commonly queried - based on repository analysis
  const criticalTables = [
    "memories",
    "rooms", 
    "participants",
    "agents",
    "users",
    "organizations",
    "usage_records",
    "credit_transactions",
    "user_characters",
    "containers",
    "api_keys",
    "generations",
    "conversations",
  ];

  for (const table of criticalTables) {
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      ) as exists
    `, [table]);

    if (!tableExists.rows[0].exists) {
      console.log(`\n⚠️  Table '${table}' not found (may have different name)`);
      continue;
    }

    // Get columns
    const columns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    // Get existing indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
    `, [table]);

    // Get table stats
    const stats = await pool.query(`
      SELECT 
        n_live_tup,
        seq_scan,
        idx_scan,
        CASE WHEN (seq_scan + idx_scan) > 0 
          THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 2)
          ELSE 0 
        END as seq_pct
      FROM pg_stat_user_tables
      WHERE relname = $1
    `, [table]);

    console.log(`\n📊 Table: ${table}`);
    console.log(`   Rows: ${stats.rows[0]?.n_live_tup || 'N/A'}`);
    console.log(`   Seq Scans: ${stats.rows[0]?.seq_scan || 0} | Index Scans: ${stats.rows[0]?.idx_scan || 0}`);
    console.log(`   Seq Scan %: ${stats.rows[0]?.seq_pct || 0}%`);
    console.log(`   Indexes (${indexes.rows.length}):`);
    
    for (const idx of indexes.rows) {
      console.log(`     - ${idx.indexname}`);
    }

    // Identify likely missing indexes based on common patterns
    const commonQueryColumns = [
      "organization_id",
      "user_id", 
      "agent_id",
      "room_id",
      "created_at",
      "updated_at",
      "type",
      "status",
    ];

    const existingIndexDefs = indexes.rows.map((i: { indexdef: string }) => i.indexdef.toLowerCase()).join(" ");
    const missingIndexes: string[] = [];

    for (const col of commonQueryColumns) {
      const colExists = columns.rows.some((c: { column_name: string }) => c.column_name === col);
      const hasIndex = existingIndexDefs.includes(col);
      
      if (colExists && !hasIndex) {
        missingIndexes.push(col);
      }
    }

    if (missingIndexes.length > 0) {
      console.log(`   ⚠️  Likely missing indexes on: ${missingIndexes.join(", ")}`);
    }
  }
}

async function main() {
  console.log("🚀 Database Performance Analysis");
  console.log("=".repeat(80));
  console.log(`Database: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Check pg_stat_statements
  const hasPgStatStatements = await checkPgStatStatements();
  console.log(`\npg_stat_statements extension: ${hasPgStatStatements ? "✅ Enabled" : "❌ Not available"}`);

  // Connection stats
  console.log("\n" + "=".repeat(80));
  console.log("📡 CONNECTION STATISTICS");
  console.log("=".repeat(80));
  const connStats = await getConnectionStats();
  console.log(`Total: ${connStats.total} | Active: ${connStats.active} | Idle: ${connStats.idle} | Waiting: ${connStats.waiting}`);

  // Table sizes
  console.log("\n" + "=".repeat(80));
  console.log("💾 TABLE SIZES (Top 30)");
  console.log("=".repeat(80));
  const tableSizes = await getTableSizes();
  console.log(
    "Table".padEnd(40) +
    "Total Size".padEnd(15) +
    "Table Size".padEnd(15) +
    "Index Size".padEnd(15) +
    "Rows"
  );
  console.log("-".repeat(100));
  for (const table of tableSizes) {
    console.log(
      table.table_name.padEnd(40) +
      table.total_size.padEnd(15) +
      table.table_size.padEnd(15) +
      table.index_size.padEnd(15) +
      table.row_estimate
    );
  }

  // High sequential scan tables
  console.log("\n" + "=".repeat(80));
  console.log("🐌 TABLES WITH HIGH SEQUENTIAL SCAN RATIO (Potential Missing Indexes)");
  console.log("=".repeat(80));
  const seqScanTables = await getHighSeqScanTables();
  if (seqScanTables.length === 0) {
    console.log("✅ No tables with concerning sequential scan ratios");
  } else {
    console.log(
      "Table".padEnd(40) +
      "Seq Scans".padEnd(15) +
      "Idx Scans".padEnd(15) +
      "Seq Scan %"
    );
    console.log("-".repeat(85));
    for (const table of seqScanTables) {
      console.log(
        table.relname.padEnd(40) +
        table.seq_scan.padEnd(15) +
        table.idx_scan.padEnd(15) +
        `${table.seq_scan_ratio}%`
      );
    }
  }

  // Slow queries (if pg_stat_statements available)
  if (hasPgStatStatements) {
    console.log("\n" + "=".repeat(80));
    console.log("🔴 SLOW QUERIES (mean_time > 50ms)");
    console.log("=".repeat(80));
    const slowQueries = await getSlowQueries();
    if (slowQueries.length === 0) {
      console.log("✅ No queries with mean execution time > 50ms");
    } else {
      for (let i = 0; i < slowQueries.length; i++) {
        const q = slowQueries[i];
        console.log(`\n${i + 1}. Mean: ${q.mean_time}ms | Max: ${q.max_time}ms | Calls: ${q.calls} | Rows: ${q.rows}`);
        console.log(`   ${q.query.substring(0, 200)}${q.query.length > 200 ? "..." : ""}`);
      }
    }
  }

  // Unused indexes
  console.log("\n" + "=".repeat(80));
  console.log("🗑️  UNUSED INDEXES (0 scans, excluding PKs)");
  console.log("=".repeat(80));
  const unusedIndexes = await getUnusedIndexes();
  if (unusedIndexes.length === 0) {
    console.log("✅ All indexes are being used");
  } else {
    console.log(
      "Table".padEnd(30) +
      "Index".padEnd(40) +
      "Size"
    );
    console.log("-".repeat(85));
    for (const idx of unusedIndexes) {
      console.log(
        idx.relname.padEnd(30) +
        idx.indexrelname.padEnd(40) +
        idx.idx_size
      );
    }
  }

  // Missing index candidates (FK without indexes)
  console.log("\n" + "=".repeat(80));
  console.log("⚠️  MISSING INDEX CANDIDATES (Foreign Keys without Indexes)");
  console.log("=".repeat(80));
  const missingIndexes = await getMissingIndexCandidates();
  if (missingIndexes.length === 0) {
    console.log("✅ All foreign keys have corresponding indexes");
  } else {
    for (const mi of missingIndexes) {
      console.log(`  - ${mi.table}.${mi.column}: ${mi.reason}`);
    }
  }

  // Lock contention
  console.log("\n" + "=".repeat(80));
  console.log("🔒 CURRENT LOCK CONTENTION");
  console.log("=".repeat(80));
  const locks = await getLockContention();
  if (locks.length === 0) {
    console.log("✅ No lock contention detected");
  } else {
    for (const lock of locks) {
      console.log(`\nBlocked for: ${lock.blocked_duration}`);
      console.log(`Blocked: ${lock.blocked_query.substring(0, 100)}`);
      console.log(`By: ${lock.blocking_query.substring(0, 100)}`);
    }
  }

  // Analyze query patterns from codebase
  await analyzeQueryPatterns();

  // All index definitions
  console.log("\n" + "=".repeat(80));
  console.log("📑 ALL INDEX DEFINITIONS");
  console.log("=".repeat(80));
  const allIndexes = await getIndexDefinitions();
  let currentTable = "";
  for (const idx of allIndexes) {
    if (idx.tablename !== currentTable) {
      console.log(`\n📁 ${idx.tablename}:`);
      currentTable = idx.tablename;
    }
    console.log(`   ${idx.indexname}`);
  }

  // Recommendations
  console.log("\n" + "=".repeat(80));
  console.log("💡 RECOMMENDATIONS");
  console.log("=".repeat(80));

  const recommendations: string[] = [];

  if (!hasPgStatStatements) {
    recommendations.push("Enable pg_stat_statements extension for detailed query analysis");
  }

  if (seqScanTables.length > 0) {
    recommendations.push(`Add indexes to reduce sequential scans on: ${seqScanTables.slice(0, 5).map(t => t.relname).join(", ")}`);
  }

  if (unusedIndexes.length > 5) {
    recommendations.push(`Consider removing ${unusedIndexes.length} unused indexes to reduce write overhead`);
  }

  if (missingIndexes.length > 0) {
    recommendations.push(`Add indexes for ${missingIndexes.length} foreign key columns`);
  }

  if (recommendations.length === 0) {
    console.log("✅ Database appears well-optimized!");
  } else {
    for (let i = 0; i < recommendations.length; i++) {
      console.log(`${i + 1}. ${recommendations[i]}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Analysis complete!");
  console.log("=".repeat(80));

  await pool.end();
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});

