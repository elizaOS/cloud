-- Add source column to user_characters table to track where characters were created
-- "cloud" = created in main Eliza Cloud dashboard
-- "miniapp" = created via miniapp integration

ALTER TABLE "user_characters" ADD COLUMN "source" text DEFAULT 'cloud' NOT NULL;

-- Add index for efficient filtering by source
CREATE INDEX IF NOT EXISTS "user_characters_source_idx" ON "user_characters" ("source");

