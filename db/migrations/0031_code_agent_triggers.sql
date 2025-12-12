-- Migration: Add code_agent_session to application_trigger_target enum
-- This enables application triggers for code agent sessions

-- Add webhook fields to code_agent_sessions
ALTER TABLE "code_agent_sessions" ADD COLUMN IF NOT EXISTS "webhook_url" text;
ALTER TABLE "code_agent_sessions" ADD COLUMN IF NOT EXISTS "webhook_secret" text;
ALTER TABLE "code_agent_sessions" ADD COLUMN IF NOT EXISTS "webhook_events" jsonb DEFAULT '["session_ready", "session_error", "session_terminated"]';

-- Add code_agent_session to application_trigger_target enum
-- Note: ALTER TYPE ... ADD VALUE is safe and idempotent in PostgreSQL 9.1+
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'code_agent_session' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_trigger_target')
  ) THEN
    ALTER TYPE "application_trigger_target" ADD VALUE 'code_agent_session';
  END IF;
EXCEPTION
  WHEN invalid_parameter_value THEN
    -- Value already exists, ignore
    NULL;
END $$;

