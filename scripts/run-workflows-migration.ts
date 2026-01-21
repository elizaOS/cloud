import { config } from "dotenv";
import { Pool } from "pg";

// Load from .env.local
config({ path: ".env.local" });
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const migrations = [
  "0009_add_workflows_table.sql",
  "0014_add_twitter_workflow_node.sql",
  "0015_add_telegram_email_workflow_nodes.sql",
  "0016_add_app_query_workflow_node.sql",
  "0017_add_workflow_runs_table.sql",
];

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Running workflow migrations...\n");

  const client = await pool.connect();
  
  for (const migration of migrations) {
    const migrationPath = join(process.cwd(), "db/migrations", migration);
    
    if (!existsSync(migrationPath)) {
      console.log(`⚠️  Migration ${migration} not found, skipping...`);
      continue;
    }

    const sql = readFileSync(migrationPath, "utf-8");
    
    try {
      await client.query(sql);
      console.log(`✅ ${migration} applied successfully`);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("already exists") || 
         error.message.includes("duplicate key"))
      ) {
        console.log(`ℹ️  ${migration} already applied, skipping...`);
      } else {
        console.error(`❌ Error in ${migration}:`, error);
        throw error;
      }
    }
  }

  client.release();
  await pool.end();
  
  console.log("\n✅ All workflow migrations completed!");
}

runMigration().catch(console.error);
