-- Admin Moderation Tables Migration
-- Run with: psql $DATABASE_URL -f db/migrations/add-admin-moderation-tables.sql

-- Create enums if they don't exist
DO $$ BEGIN
    CREATE TYPE admin_role AS ENUM ('super_admin', 'moderator', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE moderation_action AS ENUM ('refused', 'warned', 'flagged_for_ban', 'banned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_moderation_status AS ENUM ('clean', 'warned', 'spammer', 'scammer', 'banned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL UNIQUE,
    role admin_role NOT NULL DEFAULT 'moderator',
    granted_by UUID REFERENCES users(id),
    granted_by_wallet TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS admin_users_wallet_address_idx ON admin_users(wallet_address);
CREATE INDEX IF NOT EXISTS admin_users_user_id_idx ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users(role);
CREATE INDEX IF NOT EXISTS admin_users_is_active_idx ON admin_users(is_active);

-- Moderation Violations Table
CREATE TABLE IF NOT EXISTS moderation_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id TEXT,
    message_text TEXT NOT NULL,
    categories JSONB NOT NULL,
    scores JSONB NOT NULL,
    action moderation_action NOT NULL,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_violations_user_id_idx ON moderation_violations(user_id);
CREATE INDEX IF NOT EXISTS moderation_violations_action_idx ON moderation_violations(action);
CREATE INDEX IF NOT EXISTS moderation_violations_created_at_idx ON moderation_violations(created_at);
CREATE INDEX IF NOT EXISTS moderation_violations_room_id_idx ON moderation_violations(room_id);

-- User Moderation Status Table
CREATE TABLE IF NOT EXISTS user_moderation_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status user_moderation_status NOT NULL DEFAULT 'clean',
    total_violations INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    risk_score REAL NOT NULL DEFAULT 0,
    banned_by UUID REFERENCES users(id),
    banned_at TIMESTAMP,
    ban_reason TEXT,
    last_violation_at TIMESTAMP,
    last_warning_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_moderation_status_user_id_idx ON user_moderation_status(user_id);
CREATE INDEX IF NOT EXISTS user_moderation_status_status_idx ON user_moderation_status(status);
CREATE INDEX IF NOT EXISTS user_moderation_status_risk_score_idx ON user_moderation_status(risk_score);
CREATE INDEX IF NOT EXISTS user_moderation_status_total_violations_idx ON user_moderation_status(total_violations);

-- Done
SELECT 'Admin moderation tables created successfully' AS result;

