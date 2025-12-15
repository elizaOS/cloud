-- Rollback: Gallery Performance Index Migration

DROP INDEX CONCURRENTLY IF EXISTS idx_generations_gallery_query;
DROP INDEX CONCURRENTLY IF EXISTS idx_media_uploads_gallery_query;
