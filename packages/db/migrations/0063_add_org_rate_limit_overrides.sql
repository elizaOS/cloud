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

-- Prevent zero/negative RPM values at DB level (defense-in-depth for the Zod min(1) check)
ALTER TABLE "org_rate_limit_overrides"
  ADD CONSTRAINT chk_rpm_positive CHECK (
    (completions_rpm IS NULL OR completions_rpm > 0) AND
    (embeddings_rpm IS NULL OR embeddings_rpm > 0) AND
    (standard_rpm IS NULL OR standard_rpm > 0) AND
    (strict_rpm IS NULL OR strict_rpm > 0)
  );

-- Composite index for the tier spend aggregation query in recalculateOrgTier.
-- Covers: WHERE organization_id = $1 AND type = 'credit'
CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_type
  ON credit_transactions (organization_id, type);
