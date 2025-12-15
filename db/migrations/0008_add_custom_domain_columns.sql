-- Migration: Add custom_domain columns to user_characters and containers
-- These columns support custom domain routing for agents and containers

-- Add custom_domain columns to user_characters table
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Add custom_domain columns to containers table  
ALTER TABLE containers ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Add indexes for custom domain lookups
CREATE INDEX IF NOT EXISTS idx_user_characters_custom_domain ON user_characters(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_containers_custom_domain ON containers(custom_domain) WHERE custom_domain IS NOT NULL;

