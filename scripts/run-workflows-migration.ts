import { config } from "dotenv";
import { Pool } from "pg";

// Load from .env.local
config({ path: ".env.local" });
import { readFileSync } from "fs";
import { join } from "path";

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const sql = readFileSync(
    join(process.cwd(), "db/migrations/0009_add_workflows_table.sql"),
    "utf-8",
  );

  console.log("Running workflows migration...");

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✅ Workflows table created successfully!");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("already exists")
    ) {
      console.log("ℹ️  Table/types already exist, skipping...");
    } else {
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
