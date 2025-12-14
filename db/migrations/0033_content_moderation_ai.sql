-- Content Moderation AI Enhancement
-- Adds content fingerprinting, AI scan tracking, and suspension notification fields

-- Add content scanning fields
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "content_hash" text;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "last_content_scan_at" timestamp;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "last_ai_scan_at" timestamp;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "ai_scan_model" text;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "content_scan_confidence" real;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "content_scan_cache" jsonb;

-- Add suspension tracking fields
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "suspension_reason" text;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "suspension_notification" jsonb;
ALTER TABLE "managed_domains" ADD COLUMN IF NOT EXISTS "owner_notified_at" timestamp;

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS "managed_domains_content_scan_idx" ON "managed_domains" ("last_content_scan_at");
CREATE INDEX IF NOT EXISTS "managed_domains_suspended_idx" ON "managed_domains" ("suspended_at");

