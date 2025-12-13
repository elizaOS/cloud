-- Add unique constraint on container name per organization to prevent race conditions
CREATE UNIQUE INDEX IF NOT EXISTS "containers_org_name_unique_idx" 
  ON "containers" ("organization_id", "name")
  WHERE "status" != 'deleting' AND "status" != 'deleted';

-- Add comment explaining the constraint
COMMENT ON INDEX "containers_org_name_unique_idx" IS 
  'Ensures container names are unique within an organization. Excludes deleting/deleted containers to allow name reuse.';

-- Add check constraint to ensure valid status values
ALTER TABLE "containers" 
  DROP CONSTRAINT IF EXISTS "containers_status_check";

ALTER TABLE "containers"
  ADD CONSTRAINT "containers_status_check" 
  CHECK ("status" IN ('pending', 'building', 'deploying', 'running', 'stopped', 'failed', 'deleting', 'deleted'));

-- Add index on organization_id and status for quota queries (improves performance)
CREATE INDEX IF NOT EXISTS "containers_org_status_idx" 
  ON "containers" ("organization_id", "status")
  WHERE "status" NOT IN ('deleting', 'deleted');

COMMENT ON INDEX "containers_org_status_idx" IS 
  'Optimizes quota queries that count active containers per organization.';

