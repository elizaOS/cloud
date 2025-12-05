-- Miniapp Auth Sessions
-- Manages authentication sessions for the miniapp pass-through auth flow

CREATE TABLE IF NOT EXISTS miniapp_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Session identifier (passed in URL during auth flow)
    session_id TEXT NOT NULL UNIQUE,
    
    -- Status: pending → authenticated → used
    status TEXT NOT NULL DEFAULT 'pending',
    
    -- Where to redirect after auth (miniapp URL)
    callback_url TEXT NOT NULL,
    
    -- App identifier (for multi-app support in the future)
    app_id TEXT,
    
    -- User info (populated after authentication)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    
    -- Auth token (generated after successful Privy login, used for API calls)
    auth_token TEXT,
    auth_token_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    authenticated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_session_id ON miniapp_auth_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_auth_token_hash ON miniapp_auth_sessions(auth_token_hash) WHERE auth_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_user_id ON miniapp_auth_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_expires_at ON miniapp_auth_sessions(expires_at);

