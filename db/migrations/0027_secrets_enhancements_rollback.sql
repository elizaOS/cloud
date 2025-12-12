-- Secrets Enhancements Rollback
-- Reverts: secret_bindings table and app_secret_requirements table
--
-- NOTE: Does NOT drop provider column or secret_provider enum - those are from 0008
-- NOTE: Does NOT drop provider_metadata column - that is from 0008
--
-- USAGE: psql $DATABASE_URL -f 0027_secrets_enhancements_rollback.sql
-- AFTER: If also rolling back 0008, run 0008_secrets_management_rollback.sql next

-- Drop app_secret_requirements table and indexes
DROP INDEX IF EXISTS "app_secret_requirements_approved_idx";
DROP INDEX IF EXISTS "app_secret_requirements_app_idx";
DROP INDEX IF EXISTS "app_secret_requirements_app_secret_idx";
DROP TABLE IF EXISTS "app_secret_requirements";

-- Drop secret_bindings table and indexes
DROP INDEX IF EXISTS "secret_bindings_secret_idx";
DROP INDEX IF EXISTS "secret_bindings_project_idx";
DROP INDEX IF EXISTS "secret_bindings_secret_project_idx";
DROP TABLE IF EXISTS "secret_bindings";

-- Drop secrets_provider_idx (added by 0027, but column stays)
DROP INDEX IF EXISTS "secrets_provider_idx";

-- Drop secret_project_type enum (created by 0027, used only by secret_bindings)
DROP TYPE IF EXISTS "secret_project_type";

