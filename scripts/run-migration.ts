import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function runMigration() {
  const migrationPath = "./db/migrations/0027_secrets_enhancements.sql";
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  
  console.log("Running migration...");
  
  // Split by semicolon but handle $$ blocks
  const statements = migrationSql
    .split(/;(?=(?:[^$]*\$\$[^$]*\$\$)*[^$]*$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  for (const statement of statements) {
    if (statement.length > 0) {
      console.log("Executing:", statement.substring(0, 50) + "...");
      await db.execute(sql.raw(statement));
    }
  }
  
  console.log("Migration complete!");
  
  // Verify tables exist
  const tables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('secret_bindings', 'app_secret_requirements')
  `);
  console.log("Tables created:", tables.rows);
  
  process.exit(0);
}

runMigration().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
