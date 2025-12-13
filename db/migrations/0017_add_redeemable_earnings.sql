-- Migration: Add Redeemable Earnings Tables
-- Required for elizaOS token redemption system

-- Create earnings_source enum
DO $$ BEGIN
  CREATE TYPE earnings_source AS ENUM ('miniapp', 'agent', 'mcp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create ledger_entry_type enum
DO $$ BEGIN
  CREATE TYPE ledger_entry_type AS ENUM ('earning', 'redemption', 'adjustment', 'refund');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Main redeemable earnings balance table
CREATE TABLE IF NOT EXISTS redeemable_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Balance tracking
  total_earned NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  total_redeemed NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  total_pending NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  available_balance NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  
  -- Source breakdown
  earned_from_miniapps NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  earned_from_agents NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  earned_from_mcps NUMERIC(18, 4) NOT NULL DEFAULT '0.0000',
  
  -- Timestamps
  last_earning_at TIMESTAMP,
  last_redemption_at TIMESTAMP,
  
  -- Optimistic locking
  version NUMERIC(10, 0) NOT NULL DEFAULT '0',
  
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  
  -- CRITICAL: Prevent negative balance
  CONSTRAINT available_balance_non_negative CHECK (available_balance >= 0),
  
  -- CRITICAL: Ensure totals are consistent
  CONSTRAINT totals_consistent CHECK (total_earned >= total_redeemed + total_pending)
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS redeemable_earnings_user_idx ON redeemable_earnings(user_id);

-- Immutable ledger for audit trail
CREATE TABLE IF NOT EXISTS redeemable_earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  entry_type ledger_entry_type NOT NULL,
  amount NUMERIC(18, 4) NOT NULL,
  balance_after NUMERIC(18, 4) NOT NULL,
  
  -- Source info (for earnings)
  earnings_source earnings_source,
  source_id UUID,
  
  -- Redemption reference
  redemption_id UUID,
  
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes for ledger queries
CREATE INDEX IF NOT EXISTS redeemable_earnings_ledger_user_idx ON redeemable_earnings_ledger(user_id);
CREATE INDEX IF NOT EXISTS redeemable_earnings_ledger_user_created_idx ON redeemable_earnings_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS redeemable_earnings_ledger_type_idx ON redeemable_earnings_ledger(entry_type);
CREATE INDEX IF NOT EXISTS redeemable_earnings_ledger_redemption_idx ON redeemable_earnings_ledger(redemption_id);
CREATE INDEX IF NOT EXISTS redeemable_earnings_ledger_source_idx ON redeemable_earnings_ledger(earnings_source, source_id);

-- Double-redemption tracking
CREATE TABLE IF NOT EXISTS redeemed_earnings_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id UUID NOT NULL UNIQUE,
  redemption_id UUID NOT NULL,
  amount_redeemed NUMERIC(18, 4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redeemed_tracking_redemption_idx ON redeemed_earnings_tracking(redemption_id);

