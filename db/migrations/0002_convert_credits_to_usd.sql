-- Migration: Convert credit system to USD (1 credit = $1.00)
-- Created: 2025-10-28
-- Description: Converts abstract credit system (1 credit = $0.01) to direct USD mapping (1 credit = $1.00)
--              All balances and transactions are divided by 100 to reflect new currency values
--
-- IMPORTANT: credit_balance and amount are INTEGER columns, so division results in whole numbers
--            Example: 10000 / 100 = 100 (not 100.00, decimals are truncated)
--            This is intentional - we store whole dollar amounts as integers

-- Backup reminder: Ensure database backup exists before running this migration
-- Rollback: See rollback migration 0002_rollback_convert_credits_to_usd.sql

-- Begin transaction to ensure atomicity
BEGIN;

-- Convert organization credit balances from credits to dollars
-- Example: 10,000 credits → 100 (represents $100.00)
-- Note: Using FLOOR to be explicit about truncation (though integer division does this automatically)
UPDATE organizations
SET credit_balance = FLOOR(credit_balance / 100)
WHERE credit_balance IS NOT NULL;

-- Convert credit transaction amounts from credits to dollars  
-- Example: 1000 credits → 10 (represents $10.00)
UPDATE credit_transactions
SET amount = FLOOR(amount / 100)
WHERE amount IS NOT NULL;

-- Update transaction descriptions to reflect USD terminology
UPDATE credit_transactions
SET description = REPLACE(description, ' credits', ' USD')
WHERE description LIKE '% credits%';

-- Note: No schema changes needed - credit_balance and amount columns
-- already support decimal values (numeric/decimal types)

-- Commit transaction
COMMIT;
