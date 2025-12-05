-- Migration: Add CHECK constraint to prevent negative credit balances
-- This provides defense-in-depth against race conditions in credit deduction
-- Date: 2025-11-30

-- Add CHECK constraint to ensure credit_balance is never negative
ALTER TABLE "organizations" 
ADD CONSTRAINT "credit_balance_non_negative" 
CHECK ("credit_balance" >= 0);

-- Optional: Add a comment to document the constraint's purpose
COMMENT ON CONSTRAINT "credit_balance_non_negative" ON "organizations" IS 
'Prevents negative credit balances as a second line of defense against race conditions. Application-level locking via SELECT FOR UPDATE is the primary protection.';



