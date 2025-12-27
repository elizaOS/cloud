-- Gallery Performance Index Migration
-- Optimizes the gallery queries which filter by organization_id, status, and user_id
-- 
-- Problem: Gallery page taking 53+ seconds due to slow queries
-- Solution: Add composite index covering the exact query pattern
--
-- Query pattern (from listByOrganizationAndStatus):
--   WHERE organization_id = X AND status = 'completed' AND user_id = Y
--   ORDER BY created_at DESC
--   LIMIT N

-- ============================================================================
-- GENERATIONS TABLE: Gallery query optimization
-- ============================================================================

-- Composite index for gallery queries on generations table
-- Covers: WHERE org_id = X AND status = 'completed' AND user_id = Y ORDER BY created_at DESC
-- The index includes created_at as the last column for efficient sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generations_gallery_query 
ON generations(organization_id, status, user_id, created_at DESC)
WHERE status = 'completed' AND storage_url IS NOT NULL;

-- ============================================================================
-- MEDIA_UPLOADS TABLE: Gallery query optimization
-- ============================================================================

-- Composite index for gallery queries on media_uploads table
-- Covers: WHERE org_id = X AND user_id = Y ORDER BY created_at DESC
-- Note: media_uploads doesn't have a status column, but adding type for filtered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_uploads_gallery_query
ON media_uploads(organization_id, user_id, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_generations_gallery_query IS 
'Optimizes gallery page queries filtering completed generations with storage_url';

COMMENT ON INDEX idx_media_uploads_gallery_query IS 
'Optimizes gallery page queries for user uploads';
