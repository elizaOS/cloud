-- Migration: Add User MCPs Tables
-- Description: Adds tables for user-created monetizable MCP servers

-- Create pricing type enum
DO $$ BEGIN
    CREATE TYPE mcp_pricing_type AS ENUM ('free', 'credits', 'x402');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create status enum
DO $$ BEGIN
    CREATE TYPE mcp_status AS ENUM ('draft', 'pending_review', 'live', 'suspended', 'deprecated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create user_mcps table
CREATE TABLE IF NOT EXISTS user_mcps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- MCP identification
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    
    -- Owner
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Endpoint configuration
    endpoint_type TEXT NOT NULL DEFAULT 'container',
    container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
    external_endpoint TEXT,
    endpoint_path TEXT DEFAULT '/mcp',
    
    -- MCP Protocol details
    transport_type TEXT NOT NULL DEFAULT 'streamable-http',
    mcp_version TEXT DEFAULT '2025-06-18',
    
    -- Tools definition
    tools JSONB NOT NULL DEFAULT '[]',
    
    -- Category and discovery
    category TEXT NOT NULL DEFAULT 'utilities',
    tags JSONB NOT NULL DEFAULT '[]',
    icon TEXT DEFAULT 'puzzle',
    color TEXT DEFAULT '#6366F1',
    
    -- Pricing configuration
    pricing_type mcp_pricing_type NOT NULL DEFAULT 'credits',
    credits_per_request NUMERIC(10, 4) DEFAULT 1.0000,
    x402_price_usd NUMERIC(10, 6) DEFAULT 0.000100,
    x402_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Revenue share configuration
    creator_share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 80.00,
    platform_share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    
    -- Usage statistics
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_credits_earned NUMERIC(12, 4) DEFAULT 0.0000,
    total_x402_earned_usd NUMERIC(12, 6) DEFAULT 0.000000,
    unique_users INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    status mcp_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    
    -- Verification and trust
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    
    -- Documentation
    documentation_url TEXT,
    source_code_url TEXT,
    support_email TEXT,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    published_at TIMESTAMP
);

-- Create indexes for user_mcps
CREATE UNIQUE INDEX IF NOT EXISTS user_mcps_slug_org_idx ON user_mcps(slug, organization_id);
CREATE INDEX IF NOT EXISTS user_mcps_organization_idx ON user_mcps(organization_id);
CREATE INDEX IF NOT EXISTS user_mcps_created_by_idx ON user_mcps(created_by_user_id);
CREATE INDEX IF NOT EXISTS user_mcps_container_idx ON user_mcps(container_id);
CREATE INDEX IF NOT EXISTS user_mcps_category_idx ON user_mcps(category);
CREATE INDEX IF NOT EXISTS user_mcps_status_idx ON user_mcps(status);
CREATE INDEX IF NOT EXISTS user_mcps_is_public_idx ON user_mcps(is_public);
CREATE INDEX IF NOT EXISTS user_mcps_created_at_idx ON user_mcps(created_at);

-- Create mcp_usage table
CREATE TABLE IF NOT EXISTS mcp_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    mcp_id UUID NOT NULL REFERENCES user_mcps(id) ON DELETE CASCADE,
    
    -- Who used it
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Usage details
    tool_name TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    
    -- Billing
    credits_charged NUMERIC(10, 4) DEFAULT 0.0000,
    x402_amount_usd NUMERIC(10, 6) DEFAULT 0.000000,
    payment_type TEXT NOT NULL DEFAULT 'credits',
    
    -- Revenue distribution
    creator_earnings NUMERIC(10, 4) DEFAULT 0.0000,
    platform_earnings NUMERIC(10, 4) DEFAULT 0.0000,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for mcp_usage
CREATE INDEX IF NOT EXISTS mcp_usage_mcp_id_idx ON mcp_usage(mcp_id);
CREATE INDEX IF NOT EXISTS mcp_usage_organization_idx ON mcp_usage(organization_id);
CREATE INDEX IF NOT EXISTS mcp_usage_user_idx ON mcp_usage(user_id);
CREATE INDEX IF NOT EXISTS mcp_usage_created_at_idx ON mcp_usage(created_at);
CREATE INDEX IF NOT EXISTS mcp_usage_mcp_org_idx ON mcp_usage(mcp_id, organization_id);

-- Add comment
COMMENT ON TABLE user_mcps IS 'User-created MCP servers with monetization support';
COMMENT ON TABLE mcp_usage IS 'Usage tracking for user MCPs with revenue distribution';

