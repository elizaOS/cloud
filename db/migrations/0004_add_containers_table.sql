-- Add containers table for ElizaOS deployments to Cloudflare
CREATE TABLE IF NOT EXISTS "containers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "api_key_id" uuid,
  "cloudflare_worker_id" text,
  "cloudflare_container_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "image_tag" text,
  "dockerfile_path" text,
  "environment_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "max_instances" integer DEFAULT 1 NOT NULL,
  "port" integer DEFAULT 3000 NOT NULL,
  "health_check_path" text DEFAULT '/health',
  "last_deployed_at" timestamp,
  "last_health_check" timestamp,
  "deployment_log" text,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "containers" ADD CONSTRAINT "containers_organization_id_fkey" 
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade;

ALTER TABLE "containers" ADD CONSTRAINT "containers_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

ALTER TABLE "containers" ADD CONSTRAINT "containers_api_key_id_fkey" 
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE set null;

-- Add indexes
CREATE INDEX IF NOT EXISTS "containers_organization_idx" ON "containers" ("organization_id");
CREATE INDEX IF NOT EXISTS "containers_user_idx" ON "containers" ("user_id");
CREATE INDEX IF NOT EXISTS "containers_status_idx" ON "containers" ("status");
CREATE INDEX IF NOT EXISTS "containers_cloudflare_worker_idx" ON "containers" ("cloudflare_worker_id");

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_containers_updated_at BEFORE UPDATE ON "containers"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

