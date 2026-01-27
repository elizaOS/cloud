-- Migration: Add generated_workflows and workflow_executions tables
-- Part of the AI Workflow Factory feature

-- Create workflow status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_status') THEN
        CREATE TYPE workflow_status AS ENUM ('draft', 'testing', 'live', 'shared', 'deprecated');
    END IF;
END$$;

-- Create generated_workflows table
CREATE TABLE IF NOT EXISTS generated_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Owner
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Workflow identification
    name TEXT NOT NULL,
    description TEXT,
    
    -- Original intent that generated this workflow
    user_intent TEXT NOT NULL,
    
    -- Generated code
    generated_code TEXT NOT NULL,
    
    -- Service dependencies (e.g., ['google', 'notion', 'blooio'])
    service_dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Execution plan
    execution_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Test results from validation
    test_results JSONB DEFAULT '{}'::jsonb,
    
    -- Generation metadata
    generation_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    status workflow_status NOT NULL DEFAULT 'draft',
    
    -- Usage statistics
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    success_rate NUMERIC(5,2) DEFAULT 0.00,
    
    -- Average execution time in milliseconds
    avg_execution_time_ms INTEGER,
    
    -- Sharing
    is_public BOOLEAN NOT NULL DEFAULT false,
    mcp_id UUID,  -- Will add FK constraint when user_mcps table exists
    shared_at TIMESTAMP,
    
    -- Versioning
    version TEXT NOT NULL DEFAULT '1.0.0',
    parent_workflow_id UUID,
    
    -- Tags for discovery
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Category
    category TEXT DEFAULT 'custom',
    
    -- Additional metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Create indexes for generated_workflows
CREATE INDEX IF NOT EXISTS generated_workflows_organization_idx ON generated_workflows(organization_id);
CREATE INDEX IF NOT EXISTS generated_workflows_created_by_idx ON generated_workflows(created_by_user_id);
CREATE INDEX IF NOT EXISTS generated_workflows_status_idx ON generated_workflows(status);
CREATE INDEX IF NOT EXISTS generated_workflows_is_public_idx ON generated_workflows(is_public);
CREATE INDEX IF NOT EXISTS generated_workflows_mcp_id_idx ON generated_workflows(mcp_id);
CREATE INDEX IF NOT EXISTS generated_workflows_created_at_idx ON generated_workflows(created_at);
CREATE INDEX IF NOT EXISTS generated_workflows_category_idx ON generated_workflows(category);
CREATE INDEX IF NOT EXISTS generated_workflows_parent_idx ON generated_workflows(parent_workflow_id);

-- Create workflow_executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    workflow_id UUID NOT NULL REFERENCES generated_workflows(id) ON DELETE CASCADE,
    
    -- Who executed it
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Execution details
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    
    -- Input/Output
    input_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_result JSONB,
    
    -- Error details if failed
    error_message TEXT,
    error_stack TEXT,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for workflow_executions
CREATE INDEX IF NOT EXISTS workflow_executions_workflow_idx ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_executions_organization_idx ON workflow_executions(organization_id);
CREATE INDEX IF NOT EXISTS workflow_executions_user_idx ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS workflow_executions_status_idx ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS workflow_executions_started_at_idx ON workflow_executions(started_at);
