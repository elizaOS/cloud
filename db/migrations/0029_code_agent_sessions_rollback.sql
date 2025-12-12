-- Rollback: 0029_code_agent_sessions
-- Drops all code agent related tables and indexes

-- Drop indexes first
DROP INDEX IF EXISTS "interpreter_executions_created_at_idx";
DROP INDEX IF EXISTS "interpreter_executions_language_idx";
DROP INDEX IF EXISTS "interpreter_executions_user_idx";
DROP INDEX IF EXISTS "interpreter_executions_org_idx";

DROP INDEX IF EXISTS "code_agent_commands_created_at_idx";
DROP INDEX IF EXISTS "code_agent_commands_status_idx";
DROP INDEX IF EXISTS "code_agent_commands_session_idx";

DROP INDEX IF EXISTS "code_agent_snapshots_storage_key_idx";
DROP INDEX IF EXISTS "code_agent_snapshots_created_at_idx";
DROP INDEX IF EXISTS "code_agent_snapshots_session_idx";

DROP INDEX IF EXISTS "code_agent_sessions_expires_at_idx";
DROP INDEX IF EXISTS "code_agent_sessions_created_at_idx";
DROP INDEX IF EXISTS "code_agent_sessions_runtime_idx";
DROP INDEX IF EXISTS "code_agent_sessions_status_idx";
DROP INDEX IF EXISTS "code_agent_sessions_user_idx";
DROP INDEX IF EXISTS "code_agent_sessions_org_idx";

-- Drop tables (order matters due to foreign keys)
DROP TABLE IF EXISTS "interpreter_executions";
DROP TABLE IF EXISTS "code_agent_commands";
DROP TABLE IF EXISTS "code_agent_snapshots";
DROP TABLE IF EXISTS "code_agent_sessions";


