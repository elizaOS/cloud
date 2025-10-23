-- Rollback migration for 0001_woozy_joseph.sql
-- This script reverses the changes made in the forward migration

-- Drop the index first
DROP INDEX IF EXISTS "containers_character_idx";

-- Drop the foreign key constraint
ALTER TABLE "containers" DROP CONSTRAINT IF EXISTS "containers_character_id_user_characters_id_fk";

-- Drop the character_id column
ALTER TABLE "containers" DROP COLUMN IF EXISTS "character_id";

-- Restore the unique constraint on agents.name
-- Note: This assumes the constraint was named "name_unique" in the original schema
-- If there are duplicate names in the database, this will fail
-- You may need to clean up duplicate names before running this
ALTER TABLE "agents" ADD CONSTRAINT "name_unique" UNIQUE("name");

