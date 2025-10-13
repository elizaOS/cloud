import { config } from "dotenv";
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });

async function createContainersTable() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = readFileSync(
      join(__dirname, "../db/migrations/0004_add_containers_table.sql"),
      "utf-8",
    );

    console.log("Creating containers table...");
    await pool.query(sql);
    console.log("✅ Containers table created successfully!");
  } catch (error) {
    console.error("❌ Error creating containers table:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

createContainersTable();

