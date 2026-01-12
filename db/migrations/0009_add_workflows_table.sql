-- Add workflows table and related enums
-- Migration: 0009_add_workflows_table

-- Create workflow status enum
CREATE TYPE "workflow_status" AS ENUM ('draft', 'active', 'paused', 'archived');

-- Create workflow trigger type enum
CREATE TYPE "workflow_trigger_type" AS ENUM ('manual', 'webhook', 'schedule');

-- Create workflow node type enum
CREATE TYPE "workflow_node_type" AS ENUM ('trigger', 'agent', 'image', 'output');

-- Create workflows table
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" "workflow_status" DEFAULT 'draft' NOT NULL,
  "trigger_config" jsonb DEFAULT '{"type":"manual"}'::jsonb NOT NULL,
  "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "workflows_organization_idx" ON "workflows" ("organization_id");
CREATE INDEX IF NOT EXISTS "workflows_created_by_idx" ON "workflows" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "workflows_status_idx" ON "workflows" ("status");
CREATE INDEX IF NOT EXISTS "workflows_created_at_idx" ON "workflows" ("created_at");
