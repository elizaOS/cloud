/**
 * Migration Consolidation Script
 *
 * WHY THIS EXISTS:
 * Over time, the migrations directory accumulated issues:
 * - Manual migrations were created with duplicate numbers (e.g., two 0002_*.sql files)
 * - The journal only tracked 7 of 29 migrations
 * - Gaps existed in the numbering sequence (missing 0018, 0019)
 *
 * This caused problems because:
 * - `db:migrate` only runs migrations listed in the journal
 * - New developers couldn't set up a fresh database reliably
 * - Production state was unclear (what was applied vs what exists)
 *
 * WHAT THIS SCRIPT DOES:
 * Implements "Fix In-Place" approach (vs "Clean Slate" which would regenerate from schema):
 * 1. Backs up existing migrations (safe rollback)
 * 2. Removes redundant duplicates (manual migrations already covered by Drizzle-generated ones)
 * 3. Renumbers all migrations sequentially (0000-N, no gaps)
 * 4. Updates the journal to track ALL migrations
 *
 * WHY FIX IN-PLACE vs CLEAN SLATE:
 * - Clean Slate requires running db:generate which prompts for user input
 * - Fix In-Place preserves the exact SQL that was applied to production
 * - Less risk of schema drift between what's in files vs what's in production
 *
 * AFTER RUNNING:
 * - For new databases: `bun run db:migrate` works correctly
 * - For production: Query __drizzle_migrations and insert entries for
 *   migrations that were applied via db:push or manual SQL
 *
 * Usage: bun run scripts/consolidate-migrations.ts
 */

import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "db/migrations");
const META_DIR = path.join(MIGRATIONS_DIR, "meta");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface MigrationFile {
  originalName: string;
  number: string;
  name: string;
  isTracked: boolean;
}

function log(message: string) {
  console.log(`[Consolidate] ${message}`);
}

function error(message: string) {
  console.error(`[Error] ${message}`);
}

async function getJournal(): Promise<Journal> {
  const journalPath = path.join(META_DIR, "_journal.json");
  const content = await readFile(journalPath, "utf-8");
  return JSON.parse(content) as Journal;
}

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const journal = await getJournal();
  const trackedTags = new Set(journal.entries.map((e) => e.tag));

  return files
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const match = f.match(/^(\d+)_(.+)\.sql$/);
      const tag = f.replace(".sql", "");
      return {
        originalName: f,
        number: match?.[1] ?? "",
        name: match?.[2] ?? "",
        isTracked: trackedTags.has(tag),
      };
    })
    .sort((a, b) => {
      const numA = parseInt(a.number, 10);
      const numB = parseInt(b.number, 10);
      if (numA !== numB) return numA - numB;
      // For same number, tracked ones first, then alphabetically
      if (a.isTracked && !b.isTracked) return -1;
      if (!a.isTracked && b.isTracked) return 1;
      return a.name.localeCompare(b.name);
    });
}

// Duplicates to remove: manual migrations that are already covered by Drizzle-generated ones
const DUPLICATES_TO_REMOVE = [
  "0002_add_webhook_events.sql", // Covered by 0002_material_karen_page.sql
  "0003_add_missing_fk_indexes.sql", // Covered by 0003_easy_molten_man.sql
  "0006_add_git_columns_to_sessions.sql", // Covered by 0006_add-unique-username-constraint.sql
];

async function backupMigrations(): Promise<string> {
  const timestamp = Date.now();
  const backupDir = path.join(
    process.cwd(),
    `db/migrations-backup-${timestamp}`
  );

  log(`Creating backup at ${backupDir}...`);

  await mkdir(backupDir, { recursive: true });
  await mkdir(path.join(backupDir, "meta"), { recursive: true });

  const files = await readdir(MIGRATIONS_DIR);
  for (const file of files) {
    if (file === "meta") continue;
    await copyFile(
      path.join(MIGRATIONS_DIR, file),
      path.join(backupDir, file)
    );
  }

  const metaFiles = await readdir(META_DIR);
  for (const file of metaFiles) {
    await copyFile(
      path.join(META_DIR, file),
      path.join(backupDir, "meta", file)
    );
  }

  log(`✓ Migrations backed up to ${backupDir}`);
  return backupDir;
}

async function consolidateMigrations(): Promise<void> {
  const migrations = await getMigrationFiles();

  log("Analyzing migrations...");
  log(`  Total files: ${migrations.length}`);
  log(`  Tracked: ${migrations.filter((m) => m.isTracked).length}`);
  log(`  Untracked: ${migrations.filter((m) => !m.isTracked).length}`);

  // Filter out duplicates
  const filtered = migrations.filter(
    (m) => !DUPLICATES_TO_REMOVE.includes(m.originalName)
  );

  log(`  After removing duplicates: ${filtered.length}`);
  log("");

  // Create temp directory for renumbered files
  const tempDir = path.join(process.cwd(), "db/migrations-temp");
  await mkdir(tempDir, { recursive: true });
  await mkdir(path.join(tempDir, "meta"), { recursive: true });

  // Renumber and copy files
  const newJournalEntries: JournalEntry[] = [];
  const baseTimestamp = Date.now();

  for (let i = 0; i < filtered.length; i++) {
    const migration = filtered[i]!;
    const newNumber = i.toString().padStart(4, "0");
    const newFileName = `${newNumber}_${migration.name}.sql`;
    const newTag = `${newNumber}_${migration.name}`;

    log(`  ${migration.originalName} -> ${newFileName}`);

    // Copy file with new name
    await copyFile(
      path.join(MIGRATIONS_DIR, migration.originalName),
      path.join(tempDir, newFileName)
    );

    // Add to journal
    newJournalEntries.push({
      idx: i,
      version: "7",
      when: baseTimestamp + i,
      tag: newTag,
      breakpoints: true,
    });
  }

  // Write new journal
  const newJournal: Journal = {
    version: "7",
    dialect: "postgresql",
    entries: newJournalEntries,
  };

  await writeFile(
    path.join(tempDir, "meta/_journal.json"),
    JSON.stringify(newJournal, null, 2)
  );

  // Remove old migrations and rename temp to migrations
  log("");
  log("Replacing migrations directory...");

  // Remove all SQL files from migrations dir
  const oldFiles = await readdir(MIGRATIONS_DIR);
  for (const file of oldFiles) {
    if (file.endsWith(".sql")) {
      await rm(path.join(MIGRATIONS_DIR, file));
    }
  }

  // Remove old meta files except snapshots we want to preserve
  const oldMetaFiles = await readdir(META_DIR);
  for (const file of oldMetaFiles) {
    await rm(path.join(META_DIR, file));
  }

  // Copy new files to migrations dir
  const newFiles = await readdir(tempDir);
  for (const file of newFiles) {
    if (file === "meta") continue;
    await copyFile(path.join(tempDir, file), path.join(MIGRATIONS_DIR, file));
  }

  // Copy new journal
  await copyFile(
    path.join(tempDir, "meta/_journal.json"),
    path.join(META_DIR, "_journal.json")
  );

  // Remove temp dir
  await rm(tempDir, { recursive: true });

  log("✓ Migrations consolidated");
}

async function printSummary(): Promise<void> {
  const journal = await getJournal();
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith(".sql"));

  console.log("\n📋 NEW MIGRATION STATE:");
  console.log(`   SQL files: ${sqlFiles.length}`);
  console.log(`   Journal entries: ${journal.entries.length}`);
  console.log("");
  console.log("   Migrations:");
  for (const entry of journal.entries) {
    console.log(`     ${entry.idx}: ${entry.tag}`);
  }
}

async function main() {
  console.log("\n=== Migration Consolidation (Fix In-Place) ===\n");

  console.log("This script will:");
  console.log("  1. Back up existing migrations");
  console.log("  2. Remove redundant duplicate migrations");
  console.log("  3. Renumber all migrations sequentially (0000-N)");
  console.log("  4. Update the journal to track all migrations");
  console.log("");

  console.log("Duplicates to remove (covered by Drizzle-generated migrations):");
  for (const dup of DUPLICATES_TO_REMOVE) {
    console.log(`  - ${dup}`);
  }
  console.log("");

  const backupDir = await backupMigrations();
  await consolidateMigrations();
  await printSummary();

  console.log("\n=== Consolidation Complete ===\n");
  console.log("Next steps:");
  console.log(`  1. Review the backup at: ${backupDir}`);
  console.log("  2. For NEW databases: run 'bun run db:migrate'");
  console.log("  3. For EXISTING production databases:");
  console.log("     - First query what's applied: SELECT * FROM __drizzle_migrations;");
  console.log("     - Then insert entries for any new migrations that were already");
  console.log("       applied manually (via db:push or direct SQL)");
  console.log("");
  console.log("  4. Delete the backup once verified: rm -rf " + backupDir);
  console.log("");
}

main().catch((e) => {
  error(`Failed: ${e}`);
  process.exit(1);
});
