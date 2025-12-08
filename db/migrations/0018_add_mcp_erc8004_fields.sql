-- Migration: Add ERC-8004 on-chain registration fields to user_mcps table
-- This enables user MCPs to be registered on the ERC-8004 Identity Registry
-- making them discoverable by other agents across the ecosystem

-- Add ERC-8004 registration fields
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_registered BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_network TEXT;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_agent_id INTEGER;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_agent_uri TEXT;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_tx_hash TEXT;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS erc8004_registered_at TIMESTAMP;

-- Add index for querying registered MCPs
CREATE INDEX IF NOT EXISTS idx_user_mcps_erc8004_registered ON user_mcps(erc8004_registered);

-- Add composite index for network + agent_id lookups
CREATE INDEX IF NOT EXISTS idx_user_mcps_erc8004_agent ON user_mcps(erc8004_network, erc8004_agent_id) 
  WHERE erc8004_registered = true;

-- Comment for documentation
COMMENT ON COLUMN user_mcps.erc8004_registered IS 'Whether this MCP is registered on ERC-8004';
COMMENT ON COLUMN user_mcps.erc8004_network IS 'Network where registered (e.g., base-sepolia, base)';
COMMENT ON COLUMN user_mcps.erc8004_agent_id IS 'Token ID on the ERC-8004 Identity Registry';
COMMENT ON COLUMN user_mcps.erc8004_agent_uri IS 'IPFS or HTTP URI for the registration file';
COMMENT ON COLUMN user_mcps.erc8004_tx_hash IS 'Transaction hash of the registration';
COMMENT ON COLUMN user_mcps.erc8004_registered_at IS 'Timestamp when registered on-chain';


