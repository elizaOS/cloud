#!/usr/bin/env bun
/**
 * Run SQL migration for admin moderation tables
 */

import { db } from "@/db/client";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("🔧 Running admin moderation tables migration...\n");

  // Drop old conflicting enum if exists
  console.log("Dropping old conflicting enums if they exist...");
  await db.execute(sql`DROP TYPE IF EXISTS user_moderation_status CASCADE`);

  // Create enums
  console.log("Creating enums...");

  await db.execute(sql`
    DO $$ BEGIN
        CREATE TYPE admin_role AS ENUM ('super_admin', 'moderator', 'viewer');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$
  `);

  await db.execute(sql`
    DO $$ BEGIN
        CREATE TYPE moderation_action AS ENUM ('refused', 'warned', 'flagged_for_ban', 'banned');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$
  `);

  await db.execute(sql`
    DO $$ BEGIN
        CREATE TYPE user_mod_status AS ENUM ('clean', 'warned', 'spammer', 'scammer', 'banned');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$
  `);

  console.log("✅ Enums created\n");

  // Create admin_users table
  console.log("Creating admin_users table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wallet_address TEXT NOT NULL UNIQUE,
        role admin_role NOT NULL DEFAULT 'moderator',
        granted_by UUID REFERENCES users(id),
        granted_by_wallet TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMP
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS admin_users_wallet_address_idx ON admin_users(wallet_address)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS admin_users_user_id_idx ON admin_users(user_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users(role)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS admin_users_is_active_idx ON admin_users(is_active)`,
  );
  console.log("✅ admin_users table created\n");

  // Create moderation_violations table
  console.log("Creating moderation_violations table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS moderation_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id TEXT,
        message_text TEXT NOT NULL,
        categories JSONB NOT NULL,
        scores JSONB NOT NULL,
        action moderation_action NOT NULL,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS moderation_violations_user_id_idx ON moderation_violations(user_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS moderation_violations_action_idx ON moderation_violations(action)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS moderation_violations_created_at_idx ON moderation_violations(created_at)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS moderation_violations_room_id_idx ON moderation_violations(room_id)`,
  );
  console.log("✅ moderation_violations table created\n");

  // Create user_moderation_status table
  console.log("Creating user_moderation_status table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_moderation_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status user_mod_status NOT NULL DEFAULT 'clean',
        total_violations INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        risk_score REAL NOT NULL DEFAULT 0,
        banned_by UUID REFERENCES users(id),
        banned_at TIMESTAMP,
        ban_reason TEXT,
        last_violation_at TIMESTAMP,
        last_warning_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS user_moderation_status_user_id_idx ON user_moderation_status(user_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS user_moderation_status_status_idx ON user_moderation_status(status)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS user_moderation_status_risk_score_idx ON user_moderation_status(risk_score)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS user_moderation_status_total_violations_idx ON user_moderation_status(total_violations)`,
  );
  console.log("✅ user_moderation_status table created\n");

  console.log("🎉 Migration complete!");
  process.exit(0);
}

runMigration().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
