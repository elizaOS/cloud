-- Migration: Add architecture field to containers table
-- Supports multi-architecture deployments (ARM64 t4g vs x86_64 t3)

ALTER TABLE "containers" ADD COLUMN "architecture" text DEFAULT 'arm64' NOT NULL;

-- Add index for architecture filtering
CREATE INDEX IF NOT EXISTS "containers_architecture_idx" ON "containers" ("architecture");

-- Update comment
COMMENT ON COLUMN "containers"."architecture" IS 'CPU architecture: arm64 (AWS Graviton/t4g) or x86_64 (Intel/AMD/t3)';

