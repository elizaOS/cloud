-- Token Redemptions Migration
-- Adds tables for elizaOS token payout system

-- Create enum types for redemption status and network
DO $$ BEGIN
    CREATE TYPE "redemption_network" AS ENUM ('ethereum', 'base', 'bnb', 'solana');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "redemption_status" AS ENUM ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Token Redemptions table
-- Tracks user requests to convert points to elizaOS tokens
CREATE TABLE IF NOT EXISTS "token_redemptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "app_id" uuid REFERENCES "apps"("id") ON DELETE SET NULL,
    
    -- Amounts
    "points_amount" numeric(12, 2) NOT NULL,
    "usd_value" numeric(12, 4) NOT NULL,
    "eliza_price_usd" numeric(18, 8) NOT NULL,
    "eliza_amount" numeric(24, 8) NOT NULL,
    "price_quote_expires_at" timestamp NOT NULL,
    
    -- Destination
    "network" "redemption_network" NOT NULL,
    "payout_address" text NOT NULL,
    "address_signature" text,
    
    -- Status tracking
    "status" "redemption_status" NOT NULL DEFAULT 'pending',
    "processing_started_at" timestamp,
    "processing_worker_id" text,
    
    -- Completion
    "tx_hash" text,
    "completed_at" timestamp,
    
    -- Failure tracking
    "failure_reason" text,
    "retry_count" numeric(3, 0) NOT NULL DEFAULT '0',
    
    -- Admin review
    "requires_review" boolean NOT NULL DEFAULT false,
    "reviewed_by" uuid REFERENCES "users"("id"),
    "reviewed_at" timestamp,
    "review_notes" text,
    
    -- Audit metadata
    "metadata" jsonb NOT NULL DEFAULT '{}',
    
    -- Timestamps
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for token_redemptions
CREATE INDEX IF NOT EXISTS "token_redemptions_user_idx" ON "token_redemptions"("user_id");
CREATE INDEX IF NOT EXISTS "token_redemptions_app_idx" ON "token_redemptions"("app_id");
CREATE INDEX IF NOT EXISTS "token_redemptions_status_idx" ON "token_redemptions"("status");
CREATE INDEX IF NOT EXISTS "token_redemptions_status_created_idx" ON "token_redemptions"("status", "created_at");
CREATE INDEX IF NOT EXISTS "token_redemptions_network_idx" ON "token_redemptions"("network");
CREATE INDEX IF NOT EXISTS "token_redemptions_payout_idx" ON "token_redemptions"("payout_address");

-- Partial unique index to enforce only one pending redemption per user
CREATE UNIQUE INDEX IF NOT EXISTS "token_redemptions_pending_user_idx" 
ON "token_redemptions"("user_id") 
WHERE "status" = 'pending';


-- Redemption Limits table
-- Tracks daily redemption totals per user for rate limiting
CREATE TABLE IF NOT EXISTS "redemption_limits" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "date" timestamp NOT NULL,
    "daily_usd_total" numeric(12, 2) NOT NULL DEFAULT '0.00',
    "redemption_count" numeric(5, 0) NOT NULL DEFAULT '0',
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Unique constraint for user + date combination
CREATE UNIQUE INDEX IF NOT EXISTS "redemption_limits_user_date_idx" 
ON "redemption_limits"("user_id", "date");


-- elizaOS Token Prices cache table
-- Caches token prices to reduce API calls
CREATE TABLE IF NOT EXISTS "eliza_token_prices" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "network" text NOT NULL,
    "price_usd" numeric(18, 8) NOT NULL,
    "source" text NOT NULL,
    "fetched_at" timestamp NOT NULL DEFAULT now(),
    "expires_at" timestamp NOT NULL,
    "metadata" jsonb NOT NULL DEFAULT '{}'
);

-- Indexes for eliza_token_prices
CREATE INDEX IF NOT EXISTS "eliza_token_prices_network_source_idx" 
ON "eliza_token_prices"("network", "source");

CREATE INDEX IF NOT EXISTS "eliza_token_prices_expires_idx" 
ON "eliza_token_prices"("expires_at");


-- Add comment for documentation
COMMENT ON TABLE "token_redemptions" IS 'Tracks user requests to redeem points for elizaOS tokens. 1 point = $0.01 USDC value.';
COMMENT ON TABLE "redemption_limits" IS 'Daily rate limiting for token redemptions per user.';
COMMENT ON TABLE "eliza_token_prices" IS 'Price cache for elizaOS token across different networks.';

COMMENT ON COLUMN "token_redemptions"."points_amount" IS 'Points to redeem (1 point = $0.01)';
COMMENT ON COLUMN "token_redemptions"."eliza_price_usd" IS 'elizaOS token price in USD at time of quote';
COMMENT ON COLUMN "token_redemptions"."eliza_amount" IS 'Calculated elizaOS tokens to send (usd_value / eliza_price_usd)';

