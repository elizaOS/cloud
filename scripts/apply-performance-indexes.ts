#!/usr/bin/env bun
/**
 * Apply Performance Optimization Indexes
 * 
 * Runs the 0032_performance_optimization_indexes.sql migration.
 * This creates indexes to optimize slow database queries.
 * 
 * Usage:
 *   bun run scripts/apply-performance-indexes.ts
 *   bun run scripts/apply-performance-indexes.ts --dry-run
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  console.log("🚀 Applying Performance Optimization Indexes");
  console.log("=".repeat(60));
  console.log(`Database: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // Read migration file
  const migrationPath = join(
    process.cwd(),
    "db/migrations/0032_performance_optimization_indexes.sql"
  );
  
  let sql: string;
  try {
    sql = readFileSync(migrationPath, "utf-8");
  } catch (err) {
    console.error(`❌ Failed to read migration file: ${migrationPath}`);
    console.error(err);
    process.exit(1);
  }

  // Extract individual statements
  // Remove comment-only lines but keep statements that have SQL after comments
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      // Remove leading comment lines from each statement
      const lines = s.split("\n");
      const sqlLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith("--");
      });
      return sqlLines.join("\n").trim();
    })
    .filter(s => s.length > 0);

  console.log(`Found ${statements.length} SQL statements to execute`);
  console.log();

  if (dryRun) {
    console.log("📋 DRY RUN - Would execute:");
    console.log("-".repeat(60));
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith("CREATE")) {
        const match = stmt.match(/CREATE\s+(INDEX|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
        if (match) {
          console.log(`  CREATE ${match[1]} ${match[2]}`);
        }
      } else if (stmt.toUpperCase().startsWith("COMMENT")) {
        console.log(`  COMMENT ON ...`);
      }
    }
    console.log();
    console.log("Run without --dry-run to apply changes");
    await pool.end();
    return;
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    // Skip comments-only statements
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;

    // Extract object name for logging
    let objectName = "statement";
    const uniqueIndexMatch = trimmed.match(/CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const indexMatch = trimmed.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tableMatch = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const commentMatch = trimmed.match(/COMMENT\s+ON\s+(\w+)/i);
    
    if (uniqueIndexMatch) objectName = `UNIQUE INDEX ${uniqueIndexMatch[1]}`;
    else if (indexMatch) objectName = `INDEX ${indexMatch[1]}`;
    else if (tableMatch) objectName = `TABLE ${tableMatch[1]}`;
    else if (commentMatch) objectName = `COMMENT`;

    try {
      await pool.query(trimmed);
      console.log(`✅ ${objectName}`);
      successCount++;
    } catch (err) {
      const pgErr = err as { code?: string; message?: string };
      
      // 42P07 = duplicate object (already exists)
      if (pgErr.code === "42P07") {
        console.log(`⏭️  ${objectName} (already exists)`);
        skipCount++;
      } else {
        console.error(`❌ ${objectName}: ${pgErr.message}`);
        errorCount++;
      }
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`Summary: ${successCount} created, ${skipCount} skipped, ${errorCount} errors`);
  
  if (errorCount > 0) {
    console.log("\n⚠️  Some indexes failed to create. Check errors above.");
    process.exit(1);
  } else {
    console.log("\n✅ All indexes applied successfully!");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

