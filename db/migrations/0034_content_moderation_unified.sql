-- Content Moderation Unified Schema
-- Adds tables for tracking all content moderation across the platform

-- Enums
DO $$ BEGIN
  CREATE TYPE "content_mod_type" AS ENUM ('image', 'text', 'agent', 'domain', 'file');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "content_mod_status" AS ENUM ('pending', 'scanning', 'clean', 'flagged', 'suspended', 'deleted', 'reviewed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "flag_severity" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Content Moderation Items table
CREATE TABLE IF NOT EXISTS "content_moderation_items" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "content_type" "content_mod_type" NOT NULL,
  "source_table" text NOT NULL,
  "source_id" uuid NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "content_url" text,
  "content_hash" text,
  "content_size_bytes" bigint,
  "is_public" boolean NOT NULL DEFAULT false,
  "status" "content_mod_status" NOT NULL DEFAULT 'pending',
  "confidence" real DEFAULT 0,
  "flags" jsonb NOT NULL DEFAULT '[]',
  "ai_model" text,
  "ai_scores" jsonb,
  "ai_reasoning" text,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "review_decision" text,
  "review_notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_scanned_at" timestamp,
  "scan_attempts" integer NOT NULL DEFAULT 0,
  "next_scan_at" timestamp
);

CREATE INDEX IF NOT EXISTS "content_mod_source_idx" ON "content_moderation_items" ("source_table", "source_id");
CREATE INDEX IF NOT EXISTS "content_mod_status_idx" ON "content_moderation_items" ("status");
CREATE INDEX IF NOT EXISTS "content_mod_org_idx" ON "content_moderation_items" ("organization_id");
CREATE INDEX IF NOT EXISTS "content_mod_user_idx" ON "content_moderation_items" ("user_id");
CREATE INDEX IF NOT EXISTS "content_mod_type_status_idx" ON "content_moderation_items" ("content_type", "status");
CREATE INDEX IF NOT EXISTS "content_mod_next_scan_idx" ON "content_moderation_items" ("next_scan_at");
CREATE INDEX IF NOT EXISTS "content_mod_created_at_idx" ON "content_moderation_items" ("created_at");

-- User Moderation Strikes table
CREATE TABLE IF NOT EXISTS "user_moderation_strikes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content_item_id" uuid REFERENCES "content_moderation_items"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "severity" "flag_severity" NOT NULL,
  "content_type" "content_mod_type" NOT NULL,
  "content_preview" text,
  "flags" jsonb NOT NULL DEFAULT '[]',
  "action_taken" text NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_mod_strikes_user_id_idx" ON "user_moderation_strikes" ("user_id");
CREATE INDEX IF NOT EXISTS "user_mod_strikes_severity_idx" ON "user_moderation_strikes" ("severity");
CREATE INDEX IF NOT EXISTS "user_mod_strikes_created_at_idx" ON "user_moderation_strikes" ("created_at");
CREATE INDEX IF NOT EXISTS "user_mod_strikes_content_type_idx" ON "user_moderation_strikes" ("content_type");

