-- Migration: Add multi-project support to containers table
-- Adds project_name, cloudformation_stack_name, and is_update fields

-- Add project_name column (required for multi-project support)
ALTER TABLE "containers" ADD COLUMN "project_name" text NOT NULL DEFAULT 'default-project';

-- Add cloudformation_stack_name to track exact stack names
ALTER TABLE "containers" ADD COLUMN "cloudformation_stack_name" text;

-- Add is_update to track if deployment was an update
ALTER TABLE "containers" ADD COLUMN "is_update" text NOT NULL DEFAULT 'false';

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "containers_project_name_idx" ON "containers" ("project_name");
CREATE INDEX IF NOT EXISTS "containers_user_project_idx" ON "containers" ("user_id", "project_name");

-- Add comment for documentation
COMMENT ON COLUMN "containers"."project_name" IS 'Project identifier to support multiple projects per user';
COMMENT ON COLUMN "containers"."cloudformation_stack_name" IS 'CloudFormation stack name for this container';
COMMENT ON COLUMN "containers"."is_update" IS 'Indicates if this deployment was an update (true) or fresh deployment (false)';

