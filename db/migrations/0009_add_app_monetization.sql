-- Migration: Add App Monetization Feature
-- This migration adds support for miniapp creator monetization
-- including app-specific credit balances and earnings tracking

-- ============================================
-- 1. Add monetization columns to apps table
-- ============================================

ALTER TABLE apps ADD COLUMN IF NOT EXISTS monetization_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS inference_markup_percentage NUMERIC(7,2) NOT NULL DEFAULT '0.00';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS purchase_share_percentage NUMERIC(5,2) NOT NULL DEFAULT '10.00';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS platform_offset_amount NUMERIC(10,2) NOT NULL DEFAULT '1.00';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS total_creator_earnings NUMERIC(12,2) NOT NULL DEFAULT '0.00';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS total_platform_revenue NUMERIC(12,2) NOT NULL DEFAULT '0.00';

-- ============================================
-- 2. Create app_credit_balances table
-- ============================================

CREATE TABLE IF NOT EXISTS app_credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Balance tracking
  credit_balance NUMERIC(10,2) NOT NULL DEFAULT '0.00',
  total_purchased NUMERIC(10,2) NOT NULL DEFAULT '0.00',
  total_spent NUMERIC(10,2) NOT NULL DEFAULT '0.00',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT app_credit_balances_balance_non_negative CHECK (credit_balance >= 0)
);

-- Unique constraint - one balance per app-user pair
CREATE UNIQUE INDEX IF NOT EXISTS app_credit_balances_app_user_idx 
  ON app_credit_balances(app_id, user_id);

CREATE INDEX IF NOT EXISTS app_credit_balances_app_idx 
  ON app_credit_balances(app_id);

CREATE INDEX IF NOT EXISTS app_credit_balances_user_idx 
  ON app_credit_balances(user_id);

CREATE INDEX IF NOT EXISTS app_credit_balances_org_idx 
  ON app_credit_balances(organization_id);

-- ============================================
-- 3. Create app_earnings table
-- ============================================

CREATE TABLE IF NOT EXISTS app_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  
  -- Earnings breakdown
  total_lifetime_earnings NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  total_inference_earnings NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  total_purchase_earnings NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  
  -- Balance states
  pending_balance NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  withdrawable_balance NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  
  -- Withdrawal tracking
  total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  last_withdrawal_at TIMESTAMP,
  
  -- Settings
  payout_threshold NUMERIC(10,2) NOT NULL DEFAULT '10.00',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One earnings record per app
CREATE UNIQUE INDEX IF NOT EXISTS app_earnings_app_idx 
  ON app_earnings(app_id);

-- ============================================
-- 4. Create app_earnings_transactions table
-- ============================================

CREATE TABLE IF NOT EXISTS app_earnings_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Transaction details
  type TEXT NOT NULL, -- 'inference_markup', 'purchase_share', 'withdrawal', 'adjustment'
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_earnings_transactions_app_idx 
  ON app_earnings_transactions(app_id);

CREATE INDEX IF NOT EXISTS app_earnings_transactions_app_created_idx 
  ON app_earnings_transactions(app_id, created_at);

CREATE INDEX IF NOT EXISTS app_earnings_transactions_user_idx 
  ON app_earnings_transactions(user_id);

CREATE INDEX IF NOT EXISTS app_earnings_transactions_type_idx 
  ON app_earnings_transactions(type);

-- ============================================
-- 5. Create trigger to auto-create app_earnings on app creation
-- ============================================

CREATE OR REPLACE FUNCTION create_app_earnings_on_app_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO app_earnings (app_id) VALUES (NEW.id)
  ON CONFLICT (app_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_app_earnings ON apps;

CREATE TRIGGER trigger_create_app_earnings
  AFTER INSERT ON apps
  FOR EACH ROW
  EXECUTE FUNCTION create_app_earnings_on_app_insert();

-- ============================================
-- 6. Backfill app_earnings for existing apps
-- ============================================

INSERT INTO app_earnings (app_id)
SELECT id FROM apps
WHERE id NOT IN (SELECT app_id FROM app_earnings)
ON CONFLICT (app_id) DO NOTHING;

-- ============================================
-- 7. Comments for documentation
-- ============================================

COMMENT ON TABLE app_credit_balances IS 'Per-app credit balances for users. Users have separate balances for each miniapp.';
COMMENT ON TABLE app_earnings IS 'Aggregate earnings summary for app creators.';
COMMENT ON TABLE app_earnings_transactions IS 'Individual earnings events for detailed history.';
COMMENT ON COLUMN apps.monetization_enabled IS 'Whether this app has monetization enabled for the creator.';
COMMENT ON COLUMN apps.inference_markup_percentage IS 'Creator markup on inference costs (0-1000%).';
COMMENT ON COLUMN apps.purchase_share_percentage IS 'Percentage of credit purchases creator earns (default 10%).';
COMMENT ON COLUMN apps.platform_offset_amount IS 'Amount platform deducts to cover infrastructure costs.';

