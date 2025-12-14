-- Rollback: Content Moderation Schema

DROP INDEX IF EXISTS "user_mod_strikes_content_type_idx";
DROP INDEX IF EXISTS "user_mod_strikes_created_at_idx";
DROP INDEX IF EXISTS "user_mod_strikes_severity_idx";
DROP INDEX IF EXISTS "user_mod_strikes_user_id_idx";

DROP TABLE IF EXISTS "user_moderation_strikes";

DROP INDEX IF EXISTS "content_mod_created_at_idx";
DROP INDEX IF EXISTS "content_mod_next_scan_idx";
DROP INDEX IF EXISTS "content_mod_type_status_idx";
DROP INDEX IF EXISTS "content_mod_user_idx";
DROP INDEX IF EXISTS "content_mod_org_idx";
DROP INDEX IF EXISTS "content_mod_status_idx";
DROP INDEX IF EXISTS "content_mod_source_idx";

DROP TABLE IF EXISTS "content_moderation_items";

DROP TYPE IF EXISTS "flag_severity";
DROP TYPE IF EXISTS "content_mod_status";
DROP TYPE IF EXISTS "content_mod_type";

