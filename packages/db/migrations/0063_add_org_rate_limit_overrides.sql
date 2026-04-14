CREATE TABLE IF NOT EXISTS "org_rate_limit_overrides" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "organization_id" uuid NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "completions_rpm" integer,
  "embeddings_rpm" integer,
  "standard_rpm" integer,
  "strict_rpm" integer,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Composite index for the tier spend aggregation query in recalculateOrgTier.
-- Covers: WHERE organization_id = $1 AND type = 'credit'
CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_type
  ON credit_transactions (organization_id, type);
