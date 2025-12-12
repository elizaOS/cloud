-- App Integrations Migration
-- Creates junction tables for linking apps to agents, workflows, and services

-- =============================================================================
-- APP AGENTS JUNCTION TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS "app_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "user_characters"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for app_agents
CREATE UNIQUE INDEX IF NOT EXISTS "app_agents_unique_idx" ON "app_agents" ("app_id", "agent_id");
CREATE INDEX IF NOT EXISTS "app_agents_app_idx" ON "app_agents" ("app_id");
CREATE INDEX IF NOT EXISTS "app_agents_agent_idx" ON "app_agents" ("agent_id");

-- =============================================================================
-- APP WORKFLOWS JUNCTION TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS "app_workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "n8n_workflows"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for app_workflows
CREATE UNIQUE INDEX IF NOT EXISTS "app_workflows_unique_idx" ON "app_workflows" ("app_id", "workflow_id");
CREATE INDEX IF NOT EXISTS "app_workflows_app_idx" ON "app_workflows" ("app_id");
CREATE INDEX IF NOT EXISTS "app_workflows_workflow_idx" ON "app_workflows" ("workflow_id");

-- =============================================================================
-- APP SERVICES JUNCTION TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS "app_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL REFERENCES "user_mcps"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for app_services
CREATE UNIQUE INDEX IF NOT EXISTS "app_services_unique_idx" ON "app_services" ("app_id", "service_id");
CREATE INDEX IF NOT EXISTS "app_services_app_idx" ON "app_services" ("app_id");
CREATE INDEX IF NOT EXISTS "app_services_service_idx" ON "app_services" ("service_id");


