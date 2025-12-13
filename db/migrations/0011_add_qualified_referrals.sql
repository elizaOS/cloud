-- Add qualified referral tracking columns
ALTER TABLE referral_signups
ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS qualified_bonus_credited BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS qualified_bonus_amount NUMERIC(10, 2) DEFAULT '0.00';

-- Add share verification tracking to social_share_rewards
ALTER TABLE social_share_rewards
ADD COLUMN IF NOT EXISTS share_intent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE NOT NULL;

-- Add total qualified earnings to referral_codes
ALTER TABLE referral_codes
ADD COLUMN IF NOT EXISTS total_qualified_earnings NUMERIC(10, 2) DEFAULT '0.00' NOT NULL;


