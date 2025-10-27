-- Migration: Add marketplace fields to user_characters table
-- Created: 2025-10-27
-- Description: Adds marketplace-specific fields for character discovery, categorization, and analytics

-- Add marketplace columns
ALTER TABLE user_characters
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0 NOT NULL;

-- Add indexes for marketplace queries
CREATE INDEX IF NOT EXISTS user_characters_category_idx ON user_characters(category);
CREATE INDEX IF NOT EXISTS user_characters_featured_idx ON user_characters(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS user_characters_is_template_idx ON user_characters(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS user_characters_is_public_idx ON user_characters(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS user_characters_popularity_idx ON user_characters(popularity_score DESC);
CREATE INDEX IF NOT EXISTS user_characters_tags_idx ON user_characters USING GIN(tags);
