-- Migration: 0036_webhooks
-- Creates tables for unified webhook system
-- Supports webhooks for external services, cron triggers, events, and more

-- Webhook Target Type Enum
DO $$ BEGIN
    CREATE TYPE webhook_target_type AS ENUM ('url', 'agent', 'application', 'workflow', 'a2a', 'mcp');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Webhook Execution Status Enum
DO $$ BEGIN
    CREATE TYPE webhook_execution_status AS ENUM ('pending', 'success', 'error', 'timeout');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Webhooks Table
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Webhook identity
  "name" text NOT NULL,
  "description" text,
  
  -- Unique key for webhook URL: /api/webhooks/{key}
  "webhook_key" text NOT NULL UNIQUE,
  
  -- Target configuration
  "target_type" webhook_target_type NOT NULL,
  "target_id" uuid,
  "target_url" text,
  
  -- Security
  "secret" text NOT NULL,
  
  -- Configuration
  "config" jsonb NOT NULL DEFAULT '{}',
  
  -- Status
  "is_active" boolean NOT NULL DEFAULT true,
  
  -- Statistics
  "execution_count" integer NOT NULL DEFAULT 0,
  "success_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  
  -- Last execution tracking
  "last_triggered_at" timestamp,
  "last_success_at" timestamp,
  "last_error_at" timestamp,
  "last_error_message" text,
  
  -- Metadata
  "metadata" jsonb DEFAULT '{}',
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Webhook Executions Table
CREATE TABLE IF NOT EXISTS "webhook_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  "webhook_id" uuid NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  
  -- Execution details
  "status" webhook_execution_status NOT NULL DEFAULT 'pending',
  "event_type" text,
  "payload" jsonb,
  
  -- Response details
  "response_status" integer,
  "response_body" text,
  "error_message" text,
  
  -- Timing
  "started_at" timestamp,
  "finished_at" timestamp,
  "duration_ms" integer,
  
  -- Request metadata
  "request_ip" text,
  "request_headers" jsonb,
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for webhooks
CREATE INDEX IF NOT EXISTS "webhooks_webhook_key_idx" ON "webhooks" ("webhook_key");
CREATE INDEX IF NOT EXISTS "webhooks_organization_idx" ON "webhooks" ("organization_id");
CREATE INDEX IF NOT EXISTS "webhooks_target_idx" ON "webhooks" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "webhooks_is_active_idx" ON "webhooks" ("is_active");
CREATE INDEX IF NOT EXISTS "webhooks_last_triggered_at_idx" ON "webhooks" ("last_triggered_at");

-- Indexes for webhook_executions
CREATE INDEX IF NOT EXISTS "webhook_executions_webhook_id_idx" ON "webhook_executions" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_executions_organization_idx" ON "webhook_executions" ("organization_id");
CREATE INDEX IF NOT EXISTS "webhook_executions_status_idx" ON "webhook_executions" ("status");
CREATE INDEX IF NOT EXISTS "webhook_executions_created_at_idx" ON "webhook_executions" ("created_at");
CREATE INDEX IF NOT EXISTS "webhook_executions_webhook_date_idx" ON "webhook_executions" ("webhook_id", "created_at");

