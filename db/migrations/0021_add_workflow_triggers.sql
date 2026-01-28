-- Migration: Add workflow triggers table
-- This table stores trigger configurations that automatically execute workflows
-- based on incoming messages, schedules, or external webhooks.

-- Create trigger type enum
DO $$ BEGIN
    CREATE TYPE "trigger_type" AS ENUM (
        'message_keyword',
        'message_contains',
        'message_from',
        'message_regex',
        'schedule',
        'webhook'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create provider filter enum
DO $$ BEGIN
    CREATE TYPE "provider_filter" AS ENUM (
        'all',
        'twilio',
        'blooio'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create workflow_triggers table
CREATE TABLE IF NOT EXISTS "workflow_triggers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "workflow_id" uuid NOT NULL REFERENCES "generated_workflows"("id") ON DELETE CASCADE,
    "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "trigger_type" "trigger_type" NOT NULL,
    "trigger_config" jsonb NOT NULL DEFAULT '{}',
    "response_config" jsonb NOT NULL DEFAULT '{"sendResponse": true}',
    "provider_filter" "provider_filter" NOT NULL DEFAULT 'all',
    "priority" integer NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "trigger_count" integer NOT NULL DEFAULT 0,
    "last_triggered_at" timestamp,
    "last_error" text,
    "last_error_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "workflow_triggers_organization_idx" ON "workflow_triggers" ("organization_id");
CREATE INDEX IF NOT EXISTS "workflow_triggers_workflow_idx" ON "workflow_triggers" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_triggers_created_by_idx" ON "workflow_triggers" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "workflow_triggers_type_idx" ON "workflow_triggers" ("trigger_type");
CREATE INDEX IF NOT EXISTS "workflow_triggers_is_active_idx" ON "workflow_triggers" ("is_active");
CREATE INDEX IF NOT EXISTS "workflow_triggers_org_active_priority_idx" ON "workflow_triggers" ("organization_id", "is_active", "priority" DESC);

-- Add comment to table
COMMENT ON TABLE "workflow_triggers" IS 'Stores trigger configurations that automatically execute workflows based on incoming messages, schedules, or webhooks';
