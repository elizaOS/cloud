-- Migration: Remove artifacts table and artifact_id from containers
-- Date: 2025-10-16
-- Reason: Migrated from Cloudflare R2 artifacts to AWS ECR. 
--         Images are tracked directly in containers table via ecr_image_uri.

-- Remove artifact_id foreign key constraint from containers if it exists
-- Note: Check constraints first to avoid errors if already removed
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'containers_artifact_id_artifacts_id_fk' 
        AND table_name = 'containers'
    ) THEN
        ALTER TABLE containers DROP CONSTRAINT containers_artifact_id_artifacts_id_fk;
    END IF;
END $$;

-- Remove artifact_id column from containers
ALTER TABLE containers DROP COLUMN IF EXISTS artifact_id;

-- Drop artifacts table and all associated indexes
DROP TABLE IF EXISTS artifacts CASCADE;

-- Note: ECR images are now tracked directly in containers table via:
-- - ecr_repository_uri: The ECR repository URI
-- - ecr_image_tag: The specific image tag
-- - No separate artifacts table needed

