-- Rollback: Remove code_agent_session trigger support
-- Note: PostgreSQL doesn't support removing enum values directly
-- The enum value remains but the columns are dropped

ALTER TABLE "code_agent_sessions" DROP COLUMN IF EXISTS "webhook_url";
ALTER TABLE "code_agent_sessions" DROP COLUMN IF EXISTS "webhook_secret";
ALTER TABLE "code_agent_sessions" DROP COLUMN IF EXISTS "webhook_events";

