import "dotenv/config";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0003...");

    await db.execute(
      sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname" text`
    );
    await db.execute(
      sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_function" text`
    );
    await db.execute(
      sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" text`
    );
    await db.execute(
      sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "response_notifications" boolean DEFAULT true`
    );
    await db.execute(
      sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "users_work_function_idx" ON "users" USING btree ("work_function")`
    );

    console.log("Migration 0003 completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

runMigration();
