-- Rollback: Remove Milaidy Sandboxes tables
-- Run this to undo migration 0029_add_milaidy_sandboxes.sql

DROP TABLE IF EXISTS "milaidy_sandbox_backups";
DROP TABLE IF EXISTS "milaidy_sandboxes";
