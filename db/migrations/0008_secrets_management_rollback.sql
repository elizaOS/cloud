-- Secrets Management Rollback
-- WARNING: This will delete ALL secrets data permanently
--
-- PREREQUISITES:
-- 1. Run 0027_secrets_enhancements_rollback.sql FIRST (drops bindings/requirements tables)
-- 2. Backup any secrets data you need before running
-- 3. This cannot be undone
--
-- USAGE: psql $DATABASE_URL -f 0008_secrets_management_rollback.sql

-- Drop triggers
DROP TRIGGER IF EXISTS oauth_sessions_updated_at_trigger ON oauth_sessions;
DROP TRIGGER IF EXISTS secrets_updated_at_trigger ON secrets;
DROP FUNCTION IF EXISTS update_secrets_updated_at();

-- Drop audit log table
DROP INDEX IF EXISTS secret_audit_log_org_action_time_idx;
DROP INDEX IF EXISTS secret_audit_log_created_at_idx;
DROP INDEX IF EXISTS secret_audit_log_actor_idx;
DROP INDEX IF EXISTS secret_audit_log_action_idx;
DROP INDEX IF EXISTS secret_audit_log_org_idx;
DROP INDEX IF EXISTS secret_audit_log_oauth_idx;
DROP INDEX IF EXISTS secret_audit_log_secret_idx;
DROP TABLE IF EXISTS secret_audit_log;

-- Drop OAuth sessions table
DROP INDEX IF EXISTS oauth_sessions_valid_idx;
DROP INDEX IF EXISTS oauth_sessions_expires_idx;
DROP INDEX IF EXISTS oauth_sessions_provider_idx;
DROP INDEX IF EXISTS oauth_sessions_user_provider_idx;
DROP INDEX IF EXISTS oauth_sessions_org_provider_idx;
DROP TABLE IF EXISTS oauth_sessions;

-- Drop secrets table
DROP INDEX IF EXISTS secrets_expires_idx;
DROP INDEX IF EXISTS secrets_name_idx;
DROP INDEX IF EXISTS secrets_env_idx;
DROP INDEX IF EXISTS secrets_scope_idx;
DROP INDEX IF EXISTS secrets_project_idx;
DROP INDEX IF EXISTS secrets_org_idx;
DROP INDEX IF EXISTS secrets_org_name_project_env_idx;
DROP TABLE IF EXISTS secrets;

-- Drop enums
DROP TYPE IF EXISTS secret_provider;
DROP TYPE IF EXISTS secret_actor_type;
DROP TYPE IF EXISTS secret_audit_action;
DROP TYPE IF EXISTS secret_environment;
DROP TYPE IF EXISTS secret_scope;

