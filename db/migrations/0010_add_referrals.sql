-- Migration: Add referral and social sharing rewards system
-- Created: 2024-12-06

-- Create enums
DO $$ BEGIN
  CREATE TYPE social_platform AS ENUM ('x', 'farcaster', 'telegram', 'discord');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE share_type AS ENUM ('app_share', 'character_share', 'invite_share');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  total_signup_earnings NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_commission_earnings NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_user_idx ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS referral_codes_code_idx ON referral_codes(code);

-- Create referral_signups table
CREATE TABLE IF NOT EXISTS referral_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signup_bonus_credited BOOLEAN NOT NULL DEFAULT false,
  signup_bonus_amount NUMERIC(10, 2) DEFAULT 0.00,
  total_commission_earned NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_signups_referred_user_idx ON referral_signups(referred_user_id);
CREATE INDEX IF NOT EXISTS referral_signups_referrer_idx ON referral_signups(referrer_user_id);
CREATE INDEX IF NOT EXISTS referral_signups_code_idx ON referral_signups(referral_code_id);

-- Create social_share_rewards table
CREATE TABLE IF NOT EXISTS social_share_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  share_type share_type NOT NULL,
  share_url TEXT,
  credits_awarded NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_share_rewards_user_idx ON social_share_rewards(user_id);
CREATE INDEX IF NOT EXISTS social_share_rewards_platform_idx ON social_share_rewards(platform);
CREATE INDEX IF NOT EXISTS social_share_rewards_user_platform_date_idx ON social_share_rewards(user_id, platform, created_at);


