-- =============================================================================
-- Organization Community Moderation Tables
-- =============================================================================
-- Comprehensive moderation system for the community manager agent.
-- Includes token gating, spam tracking, and moderation event logging.

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE moderation_action AS ENUM (
  'warn',
  'delete',
  'timeout',
  'kick',
  'ban'
);

CREATE TYPE moderation_event_type AS ENUM (
  'spam',
  'scam',
  'banned_word',
  'malicious_link',
  'phishing',
  'raid',
  'harassment',
  'nsfw',
  'manual',
  'token_gate_fail'
);

CREATE TYPE moderation_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE token_gate_chain AS ENUM (
  'solana',
  'ethereum',
  'base',
  'polygon',
  'arbitrum',
  'optimism'
);

CREATE TYPE token_gate_type AS ENUM (
  'token',
  'nft',
  'nft_collection'
);

CREATE TYPE verification_method AS ENUM (
  'signature',
  'oauth',
  'privy'
);

-- =============================================================================
-- TOKEN GATES TABLE
-- =============================================================================

CREATE TABLE org_token_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- Rule definition
  name TEXT NOT NULL,
  description TEXT,
  
  -- Token requirements
  chain token_gate_chain NOT NULL,
  token_type token_gate_type NOT NULL,
  token_address TEXT NOT NULL,
  min_balance TEXT NOT NULL DEFAULT '1',
  
  -- Optional NFT-specific
  nft_collection_id TEXT,
  required_traits JSONB,
  
  -- Role to assign
  discord_role_id TEXT,
  telegram_group_id TEXT,
  
  -- Behavior
  remove_on_fail BOOLEAN NOT NULL DEFAULT true,
  check_interval_hours INTEGER NOT NULL DEFAULT 24,
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_token_gates_org_idx ON org_token_gates(organization_id);
CREATE INDEX org_token_gates_server_idx ON org_token_gates(server_id);
CREATE INDEX org_token_gates_enabled_idx ON org_token_gates(enabled);

-- =============================================================================
-- MEMBER WALLETS TABLE
-- =============================================================================

CREATE TABLE org_member_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- Platform user identity
  platform_user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  
  -- Wallet info
  wallet_address TEXT NOT NULL,
  chain token_gate_chain NOT NULL,
  
  -- Verification
  verified_at TIMESTAMP,
  verification_method verification_method,
  verification_signature TEXT,
  
  -- Cached balance info
  last_checked_at TIMESTAMP,
  last_balance JSONB,
  
  -- Assigned roles based on this wallet
  assigned_roles JSONB DEFAULT '[]',
  
  -- Status
  is_primary BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_member_wallets_org_idx ON org_member_wallets(organization_id);
CREATE INDEX org_member_wallets_server_idx ON org_member_wallets(server_id);
CREATE INDEX org_member_wallets_platform_user_idx ON org_member_wallets(platform_user_id, platform);
CREATE INDEX org_member_wallets_wallet_idx ON org_member_wallets(wallet_address, chain);
CREATE UNIQUE INDEX org_member_wallets_unique_wallet ON org_member_wallets(server_id, wallet_address, chain);

-- =============================================================================
-- MODERATION EVENTS TABLE
-- =============================================================================

CREATE TABLE org_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- User info
  platform_user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_username TEXT,
  
  -- Event details
  event_type moderation_event_type NOT NULL,
  severity moderation_severity NOT NULL,
  
  -- Content info
  message_id TEXT,
  channel_id TEXT,
  content_sample TEXT,
  matched_pattern TEXT,
  
  -- Action taken
  action_taken moderation_action,
  action_duration_minutes INTEGER,
  action_expires_at TIMESTAMP,
  
  -- Detection info
  detected_by TEXT NOT NULL,
  confidence_score INTEGER,
  
  -- Resolution
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  false_positive BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_mod_events_org_idx ON org_moderation_events(organization_id);
CREATE INDEX org_mod_events_server_idx ON org_moderation_events(server_id);
CREATE INDEX org_mod_events_user_idx ON org_moderation_events(platform_user_id, platform);
CREATE INDEX org_mod_events_type_idx ON org_moderation_events(event_type);
CREATE INDEX org_mod_events_created_idx ON org_moderation_events(created_at);
CREATE INDEX org_mod_events_unresolved_idx ON org_moderation_events(resolved_at);

-- =============================================================================
-- SPAM TRACKING TABLE
-- =============================================================================

CREATE TABLE org_spam_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- User identity
  platform_user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  
  -- Message tracking (rolling window)
  recent_message_hashes JSONB DEFAULT '[]',
  message_timestamps JSONB DEFAULT '[]',
  
  -- Violation counts
  spam_violations_1h INTEGER NOT NULL DEFAULT 0,
  spam_violations_24h INTEGER NOT NULL DEFAULT 0,
  total_violations INTEGER NOT NULL DEFAULT 0,
  
  -- Rate limiting
  is_rate_limited BOOLEAN NOT NULL DEFAULT false,
  rate_limit_expires_at TIMESTAMP,
  rate_limit_count INTEGER NOT NULL DEFAULT 0,
  
  -- Escalation tracking
  warning_count INTEGER NOT NULL DEFAULT 0,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  last_warning_at TIMESTAMP,
  last_timeout_at TIMESTAMP,
  
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_spam_tracking_org_idx ON org_spam_tracking(organization_id);
CREATE INDEX org_spam_tracking_server_idx ON org_spam_tracking(server_id);
CREATE UNIQUE INDEX org_spam_tracking_unique_user ON org_spam_tracking(server_id, platform_user_id, platform);
CREATE INDEX org_spam_tracking_rate_limited_idx ON org_spam_tracking(is_rate_limited);

-- =============================================================================
-- BLOCKED PATTERNS TABLE
-- =============================================================================

CREATE TABLE org_blocked_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- Pattern definition
  pattern_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  
  -- Action
  action moderation_action NOT NULL DEFAULT 'delete',
  severity moderation_severity NOT NULL DEFAULT 'medium',
  
  -- Metadata
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  match_count INTEGER NOT NULL DEFAULT 0,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_blocked_patterns_org_idx ON org_blocked_patterns(organization_id);
CREATE INDEX org_blocked_patterns_server_idx ON org_blocked_patterns(server_id);
CREATE INDEX org_blocked_patterns_category_idx ON org_blocked_patterns(category);
CREATE INDEX org_blocked_patterns_enabled_idx ON org_blocked_patterns(enabled);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE org_token_gates IS 'Token-gated role requirements for community access control';
COMMENT ON TABLE org_member_wallets IS 'Verified blockchain wallets linked to community members';
COMMENT ON TABLE org_moderation_events IS 'Moderation action log for audit and escalation tracking';
COMMENT ON TABLE org_spam_tracking IS 'Per-user spam detection and rate limiting state';
COMMENT ON TABLE org_blocked_patterns IS 'Configurable patterns for scam/spam/phishing detection';


