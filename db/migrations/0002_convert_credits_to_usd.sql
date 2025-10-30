-- Migration: Convert credit system to USD (1 credit = $1.00)
-- Created: 2025-10-28
-- Description: Converts abstract credit system (1 credit = $0.01) to direct USD mapping (1 credit = $1.00)
--              All balances and transactions are divided by 100 to reflect new currency values

-- Backup reminder: Ensure database backup exists before running this migration
-- Rollback: Restore from backup_pre_usd_migration.sql if needed

-- Convert organization credit balances from credits to dollars
-- Example: 50,000 credits → 500.00 dollars
UPDATE organizations
SET credit_balance = ROUND(credit_balance / 100, 2)
WHERE credit_balance IS NOT NULL;

-- Convert credit transaction amounts from credits to dollars
-- Example: 100 credits → 1.00 dollars
UPDATE credit_transactions
SET amount = ROUND(amount / 100, 2)
WHERE amount IS NOT NULL;

-- Update transaction descriptions to reflect USD terminology
UPDATE credit_transactions
SET description = REPLACE(description, ' credits', ' USD')
WHERE description LIKE '% credits%';

-- Note: No schema changes needed - credit_balance and amount columns
-- already support decimal values (numeric/decimal types)
