-- ELIZA-1011: Enforce single OAuth per platform per user
-- This migration:
-- 1. Cleans up existing duplicate connections (keeps most recent, revokes older)
-- 2. Adds partial unique index on (user_id, platform) WHERE user_id IS NOT NULL

-- Step 1: Revoke and detach duplicate connections for the same user/platform
-- Keep the most recently used/linked connection, revoke all others
WITH ranked_connections AS (
  SELECT
    id,
    user_id,
    platform,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, platform
      ORDER BY
        COALESCE(last_used_at, linked_at, updated_at, created_at) DESC
    ) as rn
  FROM platform_credentials
  WHERE user_id IS NOT NULL
    AND status = 'active'
),
duplicates AS (
  SELECT id
  FROM ranked_connections
  WHERE rn > 1
)
UPDATE platform_credentials
SET
  status = 'revoked',
  revoked_at = NOW(),
  updated_at = NOW(),
  user_id = NULL,
  error_message = 'Revoked during migration: duplicate user/platform connection'
WHERE id IN (SELECT id FROM duplicates);

-- Step 2: Create partial unique index to enforce single OAuth per user per platform
-- NULL user_ids are allowed (org-level connections without specific user)
CREATE UNIQUE INDEX IF NOT EXISTS platform_credentials_user_platform_idx
ON platform_credentials (user_id, platform)
WHERE user_id IS NOT NULL;
