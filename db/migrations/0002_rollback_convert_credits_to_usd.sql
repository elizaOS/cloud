-- Rollback Migration: Revert USD conversion back to original credit system
-- Created: 2025-10-28
-- Description: Converts USD mapping (1 credit = $1.00) back to abstract credit system (1 credit = $0.01)
--              All balances and transactions are multiplied by 100 to restore original values

-- WARNING: Only run this rollback if the forward migration needs to be reverted
-- Ensure you have a backup before running this rollback

-- Begin transaction to ensure atomicity
BEGIN;

-- Revert organization credit balances from dollars to credits
-- Example: 100 → 10,000 credits (represents $100.00 in old system)
UPDATE organizations
SET credit_balance = credit_balance * 100
WHERE credit_balance IS NOT NULL;

-- Revert credit transaction amounts from dollars to credits
-- Example: 10 → 1,000 credits (represents $10.00 in old system)
UPDATE credit_transactions
SET amount = amount * 100
WHERE amount IS NOT NULL;

-- Revert transaction descriptions to reflect credit terminology
UPDATE credit_transactions
SET description = REPLACE(description, ' USD', ' credits')
WHERE description LIKE '% USD%';

-- Commit transaction
COMMIT;

