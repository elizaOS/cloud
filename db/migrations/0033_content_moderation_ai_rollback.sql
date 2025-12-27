-- Rollback: Content Moderation AI Enhancement

-- Remove indexes
DROP INDEX IF EXISTS "managed_domains_suspended_idx";
DROP INDEX IF EXISTS "managed_domains_content_scan_idx";

-- Remove suspension tracking fields
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "owner_notified_at";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "suspension_notification";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "suspension_reason";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "suspended_at";

-- Remove content scanning fields
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "content_scan_cache";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "content_scan_confidence";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "ai_scan_model";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "last_ai_scan_at";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "last_content_scan_at";
ALTER TABLE "managed_domains" DROP COLUMN IF EXISTS "content_hash";

