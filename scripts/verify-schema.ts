import { db } from "@/db/client";
import { sql } from "drizzle-orm";

async function verify() {
  // Check tables
  const tables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('secret_bindings', 'app_secret_requirements', 'secrets')
  `);
  console.log("Tables:", tables.rows);

  // Check secret_bindings columns
  const bindingCols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'secret_bindings'
    ORDER BY ordinal_position
  `);
  console.log("\nSecret bindings columns:", bindingCols.rows);

  // Check app_secret_requirements columns
  const appReqCols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'app_secret_requirements'
    ORDER BY ordinal_position
  `);
  console.log("\nApp secret requirements columns:", appReqCols.rows);

  // Check secrets provider column
  const secretsCols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'secrets' AND column_name IN ('provider', 'provider_metadata')
  `);
  console.log("\nSecrets new columns:", secretsCols.rows);

  process.exit(0);
}

verify().catch(e => {
  console.error("Verify failed:", e);
  process.exit(1);
});
