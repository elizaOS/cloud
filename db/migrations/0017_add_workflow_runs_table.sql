-- Add workflow runs table for execution history

-- Workflow run status enum
DO $$ BEGIN
  CREATE TYPE workflow_run_status AS ENUM ('pending', 'running', 'success', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Workflow run trigger source enum
DO $$ BEGIN
  CREATE TYPE workflow_run_trigger_source AS ENUM ('manual', 'schedule', 'webhook');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Workflow runs table
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to the workflow
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Run status
  status workflow_run_status NOT NULL DEFAULT 'pending',
  
  -- How was this run triggered
  trigger_source workflow_run_trigger_source NOT NULL DEFAULT 'manual',
  
  -- Execution results - array of node results
  node_results JSONB NOT NULL DEFAULT '[]',
  
  -- Overall execution error if any
  error TEXT,
  
  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS workflow_runs_workflow_idx ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS workflow_runs_created_at_idx ON workflow_runs(created_at);
