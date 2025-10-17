-- Migration: Clean up dead code from Cloudflare migration
-- Date: January 17, 2025
-- Description: Remove unused Cloudflare fields and artifacts table legacy columns

-- Drop Cloudflare fields from containers table
-- These are no longer used after migration to AWS ECS/ECR
ALTER TABLE containers 
  DROP COLUMN IF EXISTS cloudflare_worker_id CASCADE,
  DROP COLUMN IF EXISTS cloudflare_container_id CASCADE,
  DROP COLUMN IF EXISTS cloudflare_url CASCADE,
  DROP COLUMN IF EXISTS max_instances CASCADE;

-- Drop R2 fields from artifacts table  
-- Artifacts are now stored in ECR, not R2
ALTER TABLE artifacts
  DROP COLUMN IF EXISTS r2_key CASCADE,
  DROP COLUMN IF EXISTS r2_url CASCADE;

-- Drop old Cloudflare index if it exists
DROP INDEX IF EXISTS containers_cloudflare_worker_idx;

-- Update table comments
COMMENT ON TABLE containers IS 'AWS ECS/ECR container deployments. Cloudflare fields removed 2025-01-17.';
COMMENT ON TABLE artifacts IS 'AWS ECR Docker images. R2 fields removed 2025-01-17.';

-- Verify cleanup
DO $$ 
BEGIN 
  RAISE NOTICE 'Cleanup complete: Removed Cloudflare and R2 legacy fields from containers and artifacts tables';
END $$;

