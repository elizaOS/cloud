-- Migration: SEO tables and enums

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seo_request_type') THEN
    CREATE TYPE seo_request_type AS ENUM (
      'keyword_research',
      'serp_snapshot',
      'meta_generate',
      'schema_generate',
      'publish_bundle',
      'index_now',
      'health_check'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seo_request_status') THEN
    CREATE TYPE seo_request_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seo_artifact_type') THEN
    CREATE TYPE seo_artifact_type AS ENUM (
      'keywords',
      'meta',
      'schema',
      'serp_snapshot',
      'health_report',
      'indexnow_submission'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seo_provider') THEN
    CREATE TYPE seo_provider AS ENUM ('dataforseo', 'serpapi', 'claude', 'indexnow', 'bing');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seo_provider_status') THEN
    CREATE TYPE seo_provider_status AS ENUM ('pending', 'completed', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "seo_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "app_id" uuid REFERENCES "apps"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "type" seo_request_type NOT NULL,
  "status" seo_request_status NOT NULL DEFAULT 'pending',
  "page_url" text,
  "locale" text NOT NULL DEFAULT 'en-US',
  "search_engine" text NOT NULL DEFAULT 'google',
  "device" text NOT NULL DEFAULT 'desktop',
  "environment" text NOT NULL DEFAULT 'production',
  "agent_identifier" text,
  "keywords" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "prompt_context" text,
  "idempotency_key" text,
  "total_cost" numeric(10,4) NOT NULL DEFAULT 0,
  "error" text,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_requests_idempotency_idx"
  ON "seo_requests" ("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "seo_requests_org_idx" ON "seo_requests" ("organization_id");
CREATE INDEX IF NOT EXISTS "seo_requests_app_idx" ON "seo_requests" ("app_id");
CREATE INDEX IF NOT EXISTS "seo_requests_type_idx" ON "seo_requests" ("type");
CREATE INDEX IF NOT EXISTS "seo_requests_status_idx" ON "seo_requests" ("status");

CREATE TABLE IF NOT EXISTS "seo_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "seo_requests"("id") ON DELETE CASCADE,
  "type" seo_artifact_type NOT NULL,
  "provider" seo_provider NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "seo_artifacts_request_idx" ON "seo_artifacts" ("request_id");
CREATE INDEX IF NOT EXISTS "seo_artifacts_type_idx" ON "seo_artifacts" ("type");

CREATE TABLE IF NOT EXISTS "seo_provider_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "seo_requests"("id") ON DELETE CASCADE,
  "provider" seo_provider NOT NULL,
  "operation" text NOT NULL,
  "status" seo_provider_status NOT NULL DEFAULT 'pending',
  "external_id" text,
  "cost" numeric(10,4) NOT NULL DEFAULT 0,
  "request_payload" jsonb,
  "response_payload" jsonb,
  "error" text,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "seo_provider_calls_request_idx" ON "seo_provider_calls" ("request_id");
CREATE INDEX IF NOT EXISTS "seo_provider_calls_provider_idx" ON "seo_provider_calls" ("provider");
CREATE INDEX IF NOT EXISTS "seo_provider_calls_status_idx" ON "seo_provider_calls" ("status");

