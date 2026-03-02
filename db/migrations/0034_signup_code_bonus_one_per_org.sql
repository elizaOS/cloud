-- One signup code bonus per organization (prevents double-redemption race).
-- Partial unique index: only one credit_transactions row per org with metadata.type = 'signup_code_bonus'.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_signup_code_bonus_org_idx
ON credit_transactions (organization_id)
WHERE (metadata->>'type' = 'signup_code_bonus');

-- Migration entry for the journal
INSERT INTO __journal (name, applied_at)
VALUES ('0034_signup_code_bonus_one_per_org.sql', NOW());
