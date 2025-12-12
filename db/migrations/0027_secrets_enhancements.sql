-- Secrets Enhancements Migration
-- Adds provider column, secret_bindings table, and app_secret_requirements table

-- Create secret_provider enum
DO $$ BEGIN
  CREATE TYPE "secret_provider" AS ENUM (
    'openai', 'anthropic', 'google', 'elevenlabs', 'fal', 'stripe',
    'discord', 'telegram', 'twitter', 'github', 'slack', 'aws', 'vercel', 'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create secret_project_type enum
DO $$ BEGIN
  CREATE TYPE "secret_project_type" AS ENUM (
    'character', 'app', 'workflow', 'container', 'mcp'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to secrets table
ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "provider" "secret_provider";
ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "provider_metadata" jsonb;

-- Create index on provider
CREATE INDEX IF NOT EXISTS "secrets_provider_idx" ON "secrets" ("provider");

-- Create secret_bindings table
CREATE TABLE IF NOT EXISTS "secret_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id" uuid NOT NULL REFERENCES "secrets"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL,
  "project_type" "secret_project_type" NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for secret_bindings
CREATE UNIQUE INDEX IF NOT EXISTS "secret_bindings_secret_project_idx" 
  ON "secret_bindings" ("secret_id", "project_id", "project_type");
CREATE INDEX IF NOT EXISTS "secret_bindings_project_idx" 
  ON "secret_bindings" ("project_id", "project_type");
CREATE INDEX IF NOT EXISTS "secret_bindings_secret_idx" 
  ON "secret_bindings" ("secret_id");

-- Create app_secret_requirements table
CREATE TABLE IF NOT EXISTS "app_secret_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "secret_name" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true,
  "approved" boolean NOT NULL DEFAULT false,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for app_secret_requirements
CREATE UNIQUE INDEX IF NOT EXISTS "app_secret_requirements_app_secret_idx" 
  ON "app_secret_requirements" ("app_id", "secret_name");
CREATE INDEX IF NOT EXISTS "app_secret_requirements_app_idx" 
  ON "app_secret_requirements" ("app_id");
CREATE INDEX IF NOT EXISTS "app_secret_requirements_approved_idx" 
  ON "app_secret_requirements" ("approved");

