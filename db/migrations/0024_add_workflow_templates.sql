-- Migration: Add workflow_templates table
-- This table stores reusable workflow templates with semantic search capability
-- enabling Shaw's vision: search for similar workflows before generating new ones

-- Ensure pgvector extension is available (should already be installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the workflow_templates table
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Optional org ownership (null = system/global template)
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Source workflow this template was derived from
  source_workflow_id UUID REFERENCES generated_workflows(id) ON DELETE SET NULL,
  
  -- Searchable metadata
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  user_intent TEXT NOT NULL,
  
  -- Semantic search vector (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),
  
  -- Template data
  generated_code TEXT NOT NULL,
  execution_plan JSONB DEFAULT '[]' NOT NULL,
  
  -- Dependencies and requirements
  service_dependencies TEXT[] DEFAULT '{}',
  secret_requirements JSONB DEFAULT '[]' NOT NULL,
  
  -- Discovery
  tags TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'custom',
  is_public BOOLEAN DEFAULT false NOT NULL,
  is_system BOOLEAN DEFAULT false NOT NULL,
  
  -- Analytics
  usage_count INTEGER DEFAULT 0 NOT NULL,
  success_count INTEGER DEFAULT 0 NOT NULL,
  success_rate NUMERIC(5,2) DEFAULT 0.00,
  avg_execution_time_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Standard indexes
CREATE INDEX workflow_templates_organization_idx 
  ON workflow_templates(organization_id);

CREATE INDEX workflow_templates_category_idx 
  ON workflow_templates(category);

CREATE INDEX workflow_templates_public_idx 
  ON workflow_templates(is_public) 
  WHERE is_public = true;

CREATE INDEX workflow_templates_system_idx 
  ON workflow_templates(is_system) 
  WHERE is_system = true;

CREATE INDEX workflow_templates_source_workflow_idx 
  ON workflow_templates(source_workflow_id);

-- Vector similarity search index using IVFFlat
-- This enables fast approximate nearest neighbor search
-- Note: We use 100 lists which is good for tables up to ~1M rows
CREATE INDEX workflow_templates_embedding_idx 
  ON workflow_templates 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add comment for documentation
COMMENT ON TABLE workflow_templates IS 'Reusable workflow templates with semantic search capability for intelligent workflow reuse';
COMMENT ON COLUMN workflow_templates.embedding IS 'Vector embedding for semantic similarity search (1536 dims for text-embedding-3-small)';
