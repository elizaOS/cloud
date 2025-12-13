-- Create artifacts table for storing deployment artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX idx_artifacts_org_project ON artifacts(organization_id, project_id);
CREATE INDEX idx_artifacts_project_version ON artifacts(project_id, version);

-- Unique constraint to prevent duplicate versions for the same project
CREATE UNIQUE INDEX uniq_artifact_version ON artifacts(organization_id, project_id, version);
