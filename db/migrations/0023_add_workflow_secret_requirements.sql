-- Migration: Add workflow_secret_requirements table
-- This table stores the secret/credential requirements for each workflow
-- enabling dynamic credential validation and agent context awareness.

-- Create the secret requirement type enum
CREATE TYPE secret_requirement_type AS ENUM ('oauth', 'api_key', 'credential');

-- Create the workflow_secret_requirements table
CREATE TABLE workflow_secret_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to workflow (cascade delete when workflow is deleted)
  workflow_id UUID NOT NULL REFERENCES generated_workflows(id) ON DELETE CASCADE,
  
  -- Requirement details
  provider TEXT NOT NULL,                           -- 'google', 'twilio', 'notion', etc.
  requirement_type secret_requirement_type NOT NULL,
  secret_key TEXT,                                  -- For api_key type: 'twilio_auth_token'
  scopes TEXT[],                                    -- For oauth type: ['gmail.send', 'calendar.events']
  
  -- User-friendly info
  display_name TEXT NOT NULL,                       -- 'Google Gmail Access'
  description TEXT NOT NULL,                        -- 'Required to send emails'
  auth_url TEXT,                                    -- '/dashboard/settings?connect=google'
  
  -- Metadata
  required BOOLEAN DEFAULT true NOT NULL,
  step_number INTEGER,                              -- Which execution step needs this
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX workflow_secret_requirements_workflow_idx 
  ON workflow_secret_requirements(workflow_id);

CREATE INDEX workflow_secret_requirements_provider_idx 
  ON workflow_secret_requirements(provider);

-- Add comment for documentation
COMMENT ON TABLE workflow_secret_requirements IS 'Stores secret/credential requirements for workflows, enabling dynamic validation and agent context';
