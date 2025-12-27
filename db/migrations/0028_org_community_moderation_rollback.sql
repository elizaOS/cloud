-- =============================================================================
-- ROLLBACK: Organization Community Moderation Tables
-- =============================================================================
-- Run this to undo migration 0028_org_community_moderation.sql

-- Drop tables in reverse order of creation (respects foreign keys)
DROP TABLE IF EXISTS org_blocked_patterns;
DROP TABLE IF EXISTS org_spam_tracking;
DROP TABLE IF EXISTS org_moderation_events;
DROP TABLE IF EXISTS org_member_wallets;
DROP TABLE IF EXISTS org_token_gates;

-- Drop enums
DROP TYPE IF EXISTS verification_method;
DROP TYPE IF EXISTS token_gate_type;
DROP TYPE IF EXISTS token_gate_chain;
DROP TYPE IF EXISTS moderation_severity;
DROP TYPE IF EXISTS moderation_event_type;
DROP TYPE IF EXISTS moderation_action;


