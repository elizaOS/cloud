-- Security Enhancement Migration
-- Adds database-level constraints to prevent security issues

-- ============================================================================
-- 1. Add CHECK constraint to prevent negative credit balances
-- ============================================================================

-- App credit balances constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'app_credit_balances_balance_non_negative'
    ) THEN
        ALTER TABLE app_credit_balances
        ADD CONSTRAINT app_credit_balances_balance_non_negative
        CHECK (CAST(credit_balance AS DECIMAL) >= 0);
    END IF;
END $$;

-- Organization credit balance constraint (if not already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'organizations_credit_balance_non_negative'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT organizations_credit_balance_non_negative
        CHECK (CAST(credit_balance AS DECIMAL) >= 0);
    END IF;
END $$;

-- ============================================================================
-- 2. Add partial unique index to prevent multiple pending redemptions per user
-- ============================================================================

-- Note: This creates the actual partial index if Drizzle's implementation doesn't work
DROP INDEX IF EXISTS token_redemptions_one_pending_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS token_redemptions_one_pending_per_user
ON token_redemptions (user_id) 
WHERE status = 'pending';

-- ============================================================================
-- 3. Add index for IP-based rate limiting
-- ============================================================================

-- Index for querying redemptions by IP address (stored in metadata JSONB)
CREATE INDEX IF NOT EXISTS token_redemptions_ip_address_idx
ON token_redemptions ((metadata->>'ip_address'), created_at)
WHERE metadata->>'ip_address' IS NOT NULL;

-- ============================================================================
-- 4. Add index for payout address fraud detection
-- ============================================================================

-- Index for finding redemptions by payout address
CREATE INDEX IF NOT EXISTS token_redemptions_payout_user_idx
ON token_redemptions (payout_address, user_id, status);

-- ============================================================================
-- 5. Add constraint to prevent unreasonable values
-- ============================================================================

-- Max redemption amount constraint (100,000 points = $1000)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'token_redemptions_points_range'
    ) THEN
        ALTER TABLE token_redemptions
        ADD CONSTRAINT token_redemptions_points_range
        CHECK (
            CAST(points_amount AS DECIMAL) >= 100 AND 
            CAST(points_amount AS DECIMAL) <= 10000000
        );
    END IF;
END $$;

-- ============================================================================
-- 6. Add audit columns for security tracking
-- ============================================================================

-- Add IP address tracking column if not exists in JSONB
-- (Already in metadata, but we could add dedicated column for indexing)

-- ============================================================================
-- 7. Add expiry trigger for stale pending redemptions
-- ============================================================================

-- Function to automatically expire old pending redemptions
CREATE OR REPLACE FUNCTION expire_stale_redemptions()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE token_redemptions
    SET 
        status = 'expired',
        failure_reason = 'Automatically expired after 24 hours',
        updated_at = NOW()
    WHERE 
        status = 'pending'
        AND created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Summary of changes:
-- 1. Non-negative balance constraints on app_credit_balances and organizations
-- 2. Partial unique index ensuring only one pending redemption per user
-- 3. Index for IP-based rate limiting queries
-- 4. Index for payout address fraud detection
-- 5. Points range constraint (100 - 10,000,000)
-- 6. Function to expire stale pending redemptions
-- ============================================================================

