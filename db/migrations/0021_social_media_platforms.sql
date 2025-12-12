-- Social Media Platforms Migration
-- Adds new platform types to support cross-platform social media posting

-- =============================================================================
-- ADD NEW PLATFORM CREDENTIAL TYPES
-- =============================================================================

-- Add new values to the platform_credential_type enum
-- Note: PostgreSQL requires individual ALTER TYPE statements for each new value

DO $$
BEGIN
  -- Add bluesky if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'bluesky' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'bluesky';
  END IF;
  
  -- Add reddit if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'reddit' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'reddit';
  END IF;
  
  -- Add facebook if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'facebook' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'facebook';
  END IF;
  
  -- Add instagram if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'instagram' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'instagram';
  END IF;
  
  -- Add tiktok if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'tiktok' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'tiktok';
  END IF;
  
  -- Add linkedin if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'linkedin' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'linkedin';
  END IF;
  
  -- Add mastodon if not exists (for future use)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mastodon' AND enumtypid = 'platform_credential_type'::regtype) THEN
    ALTER TYPE platform_credential_type ADD VALUE 'mastodon';
  END IF;
END$$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TYPE platform_credential_type IS 'Supported social media platforms for credential storage. Includes: discord, telegram, twitter, gmail, slack, github, google, bluesky, reddit, facebook, instagram, tiktok, linkedin, mastodon';
