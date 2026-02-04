-- Migration: Add Discord identity columns to users table
-- Supports Discord authentication for Eliza App

-- Add Discord identity columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_global_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_avatar_url TEXT;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS users_discord_id_idx ON users(discord_id) WHERE discord_id IS NOT NULL;
