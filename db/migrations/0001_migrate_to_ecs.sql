-- Migration: Convert from Cloudflare/R2 to AWS ECS/ECR
-- Date: October 16, 2025
-- Description: Adds ECS/ECR fields and marks Cloudflare fields as legacy

-- Containers table: Add ECS/ECR fields
ALTER TABLE containers 
  ADD COLUMN IF NOT EXISTS ecr_repository_uri TEXT,
  ADD COLUMN IF NOT EXISTS ecr_image_tag TEXT,
  ADD COLUMN IF NOT EXISTS ecs_cluster_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_service_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_task_definition_arn TEXT,
  ADD COLUMN IF NOT EXISTS ecs_task_arn TEXT,
  ADD COLUMN IF NOT EXISTS load_balancer_url TEXT,
  ADD COLUMN IF NOT EXISTS desired_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cpu INTEGER DEFAULT 256,
  ADD COLUMN IF NOT EXISTS memory INTEGER DEFAULT 512;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS containers_ecs_service_idx ON containers(ecs_service_arn);
CREATE INDEX IF NOT EXISTS containers_ecr_repository_idx ON containers(ecr_repository_uri);

-- Artifacts table: Add ECR fields
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS ecr_repository_uri TEXT,
  ADD COLUMN IF NOT EXISTS ecr_image_uri TEXT,
  ADD COLUMN IF NOT EXISTS ecr_image_digest TEXT;

-- Add index for ECR repository
CREATE INDEX IF NOT EXISTS idx_artifacts_ecr_repository ON artifacts(ecr_repository_uri);

-- Optional: Drop old Cloudflare indexes (uncomment after migrating all containers)
-- DROP INDEX IF EXISTS containers_cloudflare_worker_idx;

-- Note: DO NOT drop old Cloudflare/R2 columns yet - keep them for backward compatibility
-- during migration period. They can be dropped later once all containers are migrated:

-- Future cleanup (run only after all containers migrated to ECS):
-- ALTER TABLE containers 
--   DROP COLUMN IF EXISTS cloudflare_worker_id,
--   DROP COLUMN IF EXISTS cloudflare_container_id,
--   DROP COLUMN IF EXISTS cloudflare_url,
--   DROP COLUMN IF EXISTS max_instances;

-- ALTER TABLE artifacts
--   DROP COLUMN IF EXISTS r2_key,
--   DROP COLUMN IF EXISTS r2_url;

-- Comment on migration
COMMENT ON TABLE containers IS 'Migrated to AWS ECS/ECR on 2025-10-16. Legacy Cloudflare fields preserved for backward compatibility.';
COMMENT ON TABLE artifacts IS 'Migrated to AWS ECR on 2025-10-16. Artifacts are now Docker images. Legacy R2 fields preserved for backward compatibility.';

