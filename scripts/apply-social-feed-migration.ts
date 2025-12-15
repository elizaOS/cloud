/**
 * Apply social feed migration to Neon database
 *
 * Run with: bun scripts/apply-social-feed-migration.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

function splitSqlStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;

  const lines = sqlContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip pure comment lines
    if (trimmed.startsWith("--")) continue;

    // Track parenthesis depth for multi-line statements
    for (const char of line) {
      if (char === "(") depth++;
      if (char === ")") depth--;
    }

    current += line + "\n";

    // Statement ends with semicolon at depth 0
    if (trimmed.endsWith(";") && depth === 0) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith("--")) {
        // Remove trailing semicolon for execution
        statements.push(stmt.slice(0, -1).trim());
      }
      current = "";
    }
  }

  return statements;
}

async function applyMigration() {
  console.log("=== Applying Social Feed Migration ===\n");

  // Check current state
  const existingTables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('org_feed_configs', 'social_engagement_events', 'pending_reply_confirmations', 'social_notification_messages')
  `);

  const existingEnums = await db.execute(sql`
    SELECT typname FROM pg_type WHERE typname IN ('social_engagement_type', 'reply_confirmation_status')
  `);

  console.log("Current state:");
  console.log(
    "  Tables:",
    existingTables.rows.length > 0
      ? existingTables.rows.map((r: { table_name: string }) => r.table_name)
      : "(none)",
  );
  console.log(
    "  Enums:",
    existingEnums.rows.length > 0
      ? existingEnums.rows.map((r: { typname: string }) => r.typname)
      : "(none)",
  );

  if (existingTables.rows.length === 4 && existingEnums.rows.length === 2) {
    console.log("\n✅ Migration already complete.");
    process.exit(0);
  }

  console.log("\nApplying migration...\n");

  // Read the migration file
  const migrationPath = join(
    __dirname,
    "../db/migrations/0024_social_feed_management.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf-8");

  const statements = splitSqlStatements(migrationSql);
  console.log(`Found ${statements.length} SQL statements\n`);

  let executed = 0;
  let skipped = 0;

  for (const statement of statements) {
    const preview = statement
      .substring(0, 70)
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ");

    // Check if this is a CREATE statement for something that might exist
    const isCreateType = statement.toUpperCase().startsWith("CREATE TYPE");
    const isCreateTable = statement.toUpperCase().startsWith("CREATE TABLE");
    const isCreateIndex = statement.toUpperCase().startsWith("CREATE INDEX");
    const isCreateUniqueIndex = statement
      .toUpperCase()
      .startsWith("CREATE UNIQUE INDEX");
    const isComment = statement.toUpperCase().startsWith("COMMENT ON");

    try {
      await db.execute(sql.raw(statement));
      console.log(`✓ [${executed + skipped + 1}] ${preview}...`);
      executed++;
    } catch (error: unknown) {
      const err = error as {
        cause?: { code?: string; message?: string };
        message?: string;
      };
      const causeCode = err.cause?.code;
      const causeMessage = err.cause?.message ?? "";
      const errorMessage = err.message ?? String(error);

      // Check for "already exists" errors - these are safe to skip
      // 42710 = duplicate_object (type already exists)
      // 42P07 = duplicate_table (table already exists)
      const isDuplicate =
        causeCode === "42710" ||
        causeCode === "42P07" ||
        causeMessage.includes("already exists");

      if (isDuplicate) {
        console.log(
          `⊘ [${executed + skipped + 1}] SKIP (exists): ${preview}...`,
        );
        skipped++;
      } else {
        console.error(`✗ [${executed + skipped + 1}] FAILED: ${preview}...`);
        console.error(`  Error: ${causeMessage || errorMessage}`);
        throw error;
      }
    }
  }

  console.log(
    `\n✅ Migration complete. Executed: ${executed}, Skipped: ${skipped}`,
  );

  // Verify final state
  const finalTables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('org_feed_configs', 'social_engagement_events', 'pending_reply_confirmations', 'social_notification_messages')
    ORDER BY table_name
  `);

  const finalEnums = await db.execute(sql`
    SELECT typname FROM pg_type WHERE typname IN ('social_engagement_type', 'reply_confirmation_status')
  `);

  console.log("\nFinal state:");
  console.log(
    "  Tables:",
    finalTables.rows.map((r: { table_name: string }) => r.table_name),
  );
  console.log(
    "  Enums:",
    finalEnums.rows.map((r: { typname: string }) => r.typname),
  );

  if (finalTables.rows.length !== 4 || finalEnums.rows.length !== 2) {
    console.error(
      "\n⚠️  Warning: Expected 4 tables and 2 enums but got different counts.",
    );
    process.exit(1);
  }

  process.exit(0);
}

applyMigration().catch((error) => {
  console.error("\nMigration failed:", error.message || error);
  process.exit(1);
});
