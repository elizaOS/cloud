import "dotenv/config";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0004 - user_sessions table...");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "session_token" text NOT NULL,
        "credits_used" numeric(10, 2) DEFAULT '0.00' NOT NULL,
        "requests_made" integer DEFAULT 0 NOT NULL,
        "tokens_consumed" bigint DEFAULT 0 NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "last_activity_at" timestamp DEFAULT now() NOT NULL,
        "ended_at" timestamp,
        "ip_address" text,
        "user_agent" text,
        "device_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
      )
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_organization_id_organizations_id_fk"
        FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id")
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_sessions_org_id_idx" ON "user_sessions" USING btree ("organization_id")
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_sessions_token_idx" ON "user_sessions" USING btree ("session_token")
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_sessions_started_at_idx" ON "user_sessions" USING btree ("started_at")
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "user_sessions_active_idx" ON "user_sessions" USING btree ("ended_at")
    `);

    console.log("✓ Migration 0004 completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

runMigration();
