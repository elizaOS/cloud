-- App Integrations Rollback Migration
-- Drops junction tables for app integrations

DROP TABLE IF EXISTS "app_services";
DROP TABLE IF EXISTS "app_workflows";
DROP TABLE IF EXISTS "app_agents";


