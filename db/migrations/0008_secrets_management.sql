-- Secrets Management Tables Migration
-- Production-grade secrets storage with envelope encryption

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE secret_scope AS ENUM (
  'organization',
  'project',
  'environment'
);

CREATE TYPE secret_environment AS ENUM (
  'development',
  'preview',
  'production'
);

CREATE TYPE secret_audit_action AS ENUM (
  'created',
  'read',
  'updated',
  'deleted',
  'rotated'
);

CREATE TYPE secret_actor_type AS ENUM (
  'user',
  'api_key',
  'system',
  'deployment',
  'workflow'
);

-- =============================================================================
-- SECRETS TABLE
-- =============================================================================

CREATE TABLE secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Scoping
  scope secret_scope NOT NULL DEFAULT 'organization',
  project_id UUID,
  project_type TEXT,
  environment secret_environment,
  
  -- Secret identity
  name TEXT NOT NULL,
  description TEXT,
  
  -- Encrypted value (AES-256-GCM)
  encrypted_value TEXT NOT NULL,
  
  -- Key management
  encryption_key_id TEXT NOT NULL,
  encrypted_dek TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  
  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,
  last_rotated_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  last_accessed_at TIMESTAMP,
  access_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: one secret name per org/project/environment combo
CREATE UNIQUE INDEX secrets_org_name_project_env_idx 
  ON secrets (organization_id, name, project_id, environment);

CREATE INDEX secrets_org_idx ON secrets (organization_id);
CREATE INDEX secrets_project_idx ON secrets (project_id);
CREATE INDEX secrets_scope_idx ON secrets (scope);
CREATE INDEX secrets_env_idx ON secrets (environment);
CREATE INDEX secrets_name_idx ON secrets (name);
CREATE INDEX secrets_expires_idx ON secrets (expires_at);

-- =============================================================================
-- OAUTH SESSIONS TABLE
-- =============================================================================

CREATE TABLE oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider info
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  
  -- Tokens (encrypted)
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  
  -- Encryption metadata for access token
  encryption_key_id TEXT NOT NULL,
  encrypted_dek TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  
  -- Encryption metadata for refresh token (separate DEK for security)
  refresh_encrypted_dek TEXT,
  refresh_nonce TEXT,
  refresh_auth_tag TEXT,
  
  -- Token metadata
  scopes JSONB NOT NULL DEFAULT '[]',
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  
  -- Provider-specific data (encrypted JSON)
  encrypted_provider_data TEXT,
  provider_data_nonce TEXT,
  provider_data_auth_tag TEXT,
  
  -- Usage tracking
  last_used_at TIMESTAMP,
  last_refreshed_at TIMESTAMP,
  refresh_count INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMP,
  revoke_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX oauth_sessions_org_provider_idx 
  ON oauth_sessions (organization_id, provider, user_id);
CREATE INDEX oauth_sessions_user_provider_idx ON oauth_sessions (user_id, provider);
CREATE INDEX oauth_sessions_provider_idx ON oauth_sessions (provider);
CREATE INDEX oauth_sessions_expires_idx ON oauth_sessions (access_token_expires_at);
CREATE INDEX oauth_sessions_valid_idx ON oauth_sessions (is_valid);

-- =============================================================================
-- SECRET AUDIT LOG TABLE
-- =============================================================================

CREATE TABLE secret_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference (don't FK - keep log even if secret deleted)
  secret_id UUID,
  oauth_session_id UUID,
  organization_id UUID NOT NULL,
  
  -- What happened
  action secret_audit_action NOT NULL,
  secret_name TEXT,
  
  -- Who did it
  actor_type secret_actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT,
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  source TEXT,
  
  -- Request details
  request_id TEXT,
  endpoint TEXT,
  
  -- Additional metadata
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Immutable timestamp
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX secret_audit_log_secret_idx ON secret_audit_log (secret_id);
CREATE INDEX secret_audit_log_oauth_idx ON secret_audit_log (oauth_session_id);
CREATE INDEX secret_audit_log_org_idx ON secret_audit_log (organization_id);
CREATE INDEX secret_audit_log_action_idx ON secret_audit_log (action);
CREATE INDEX secret_audit_log_actor_idx ON secret_audit_log (actor_type, actor_id);
CREATE INDEX secret_audit_log_created_at_idx ON secret_audit_log (created_at);
CREATE INDEX secret_audit_log_org_action_time_idx 
  ON secret_audit_log (organization_id, action, created_at);

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER secrets_updated_at_trigger
  BEFORE UPDATE ON secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_secrets_updated_at();

CREATE TRIGGER oauth_sessions_updated_at_trigger
  BEFORE UPDATE ON oauth_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_secrets_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE secrets IS 'Encrypted secrets storage using envelope encryption (AES-256-GCM + KMS)';
COMMENT ON TABLE oauth_sessions IS 'OAuth token storage for third-party integrations with encrypted tokens';
COMMENT ON TABLE secret_audit_log IS 'Immutable audit log for all secret operations (SOC 2 compliance)';

COMMENT ON COLUMN secrets.encrypted_dek IS 'Encrypted Data Encryption Key (DEK) - decrypted via KMS';
COMMENT ON COLUMN secrets.nonce IS 'Initialization vector for AES-GCM (96 bits, base64)';
COMMENT ON COLUMN secrets.auth_tag IS 'GCM authentication tag for integrity verification (base64)';

