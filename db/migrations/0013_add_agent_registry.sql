-- Migration: Add Agent ERC-8004 Registration and Monetization
-- Description: Adds fields for on-chain agent registration and creator monetization
-- 
-- When users make agents public on the marketplace:
-- 1. We mint them on ERC-8004 Identity Registry (Eliza Cloud pays gas)
-- 2. They become discoverable via agent0 SDK
-- 3. Creators can add markup on inference costs (like apps)

-- Add ERC-8004 registration fields
ALTER TABLE user_characters
ADD COLUMN IF NOT EXISTS erc8004_registered BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS erc8004_network TEXT,
ADD COLUMN IF NOT EXISTS erc8004_agent_id INTEGER,
ADD COLUMN IF NOT EXISTS erc8004_agent_uri TEXT,
ADD COLUMN IF NOT EXISTS erc8004_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS erc8004_registered_at TIMESTAMP;

-- Add monetization fields (similar to apps table)
ALTER TABLE user_characters
ADD COLUMN IF NOT EXISTS monetization_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS inference_markup_percentage NUMERIC(7,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS payout_wallet_address TEXT;

-- Add earnings tracking
ALTER TABLE user_characters
ADD COLUMN IF NOT EXISTS total_inference_requests INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_creator_earnings NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
ADD COLUMN IF NOT EXISTS total_platform_revenue NUMERIC(12,4) NOT NULL DEFAULT 0.0000;

-- Add protocol endpoint flags
ALTER TABLE user_characters
ADD COLUMN IF NOT EXISTS a2a_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mcp_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS user_characters_erc8004_idx 
ON user_characters(erc8004_registered);

CREATE INDEX IF NOT EXISTS user_characters_erc8004_agent_idx 
ON user_characters(erc8004_network, erc8004_agent_id);

CREATE INDEX IF NOT EXISTS user_characters_monetization_idx 
ON user_characters(monetization_enabled);

-- Add comments
COMMENT ON COLUMN user_characters.erc8004_registered IS 'Whether agent is registered on ERC-8004 Identity Registry';
COMMENT ON COLUMN user_characters.erc8004_network IS 'Network where agent is registered (base-sepolia, base)';
COMMENT ON COLUMN user_characters.erc8004_agent_id IS 'Token ID on the ERC-8004 Identity Registry';
COMMENT ON COLUMN user_characters.inference_markup_percentage IS 'Percentage markup on base inference costs (0-1000%)';
COMMENT ON COLUMN user_characters.total_creator_earnings IS 'Total earnings credited to creator from markup';

