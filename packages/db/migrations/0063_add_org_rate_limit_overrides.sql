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
