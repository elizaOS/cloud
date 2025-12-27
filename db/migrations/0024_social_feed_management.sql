-- Migration: Social Feed Management
-- Description: Tables for bidirectional social media integration
--
-- Enables organizations to:
-- 1. Monitor external social platforms for engagement
-- 2. Route notifications to internal channels (Discord, Telegram, Slack)
-- 3. Handle reply workflows with confirmation

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE social_engagement_type AS ENUM (
  'mention',
  'reply',
  'quote_tweet',
  'repost',
  'like',
  'comment',
  'follow'
);

CREATE TYPE reply_confirmation_status AS ENUM (
  'pending',
  'confirmed',
  'rejected',
  'expired',
  'sent',
  'failed'
);

-- =============================================================================
-- FEED CONFIGURATIONS TABLE
-- =============================================================================

CREATE TABLE org_feed_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Source platform to monitor
  source_platform TEXT NOT NULL, -- 'twitter', 'bluesky', etc.
  source_account_id TEXT NOT NULL, -- Account/handle to monitor
  source_username TEXT, -- Display username for reference
  credential_id UUID, -- Reference to platform credentials (no FK for flexibility)
  
  -- What to monitor
  monitor_mentions BOOLEAN NOT NULL DEFAULT true,
  monitor_replies BOOLEAN NOT NULL DEFAULT true,
  monitor_quote_tweets BOOLEAN NOT NULL DEFAULT true,
  monitor_reposts BOOLEAN NOT NULL DEFAULT false,
  monitor_likes BOOLEAN NOT NULL DEFAULT false,
  
  -- Notification channels configuration
  -- Array of: { platform: 'discord'|'telegram'|'slack', channelId: string, serverId?: string, connectionId?: string }
  notification_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Feed settings
  enabled BOOLEAN NOT NULL DEFAULT true,
  polling_interval_seconds INTEGER NOT NULL DEFAULT 60,
  min_follower_count INTEGER, -- Only notify for users with X+ followers
  filter_keywords JSONB DEFAULT '[]'::jsonb, -- Keywords to filter in/out
  filter_mode TEXT DEFAULT 'include', -- 'include' or 'exclude'
  
  -- Polling state
  last_polled_at TIMESTAMPTZ,
  last_seen_id TEXT, -- Cursor for pagination
  poll_error_count INTEGER NOT NULL DEFAULT 0,
  last_poll_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX org_feed_configs_org_idx ON org_feed_configs(organization_id);
CREATE INDEX org_feed_configs_enabled_idx ON org_feed_configs(enabled);
CREATE INDEX org_feed_configs_platform_idx ON org_feed_configs(source_platform);
CREATE INDEX org_feed_configs_poll_idx ON org_feed_configs(last_polled_at) WHERE enabled = true;
CREATE UNIQUE INDEX org_feed_configs_unique ON org_feed_configs(organization_id, source_platform, source_account_id);

-- =============================================================================
-- SOCIAL ENGAGEMENT EVENTS TABLE
-- =============================================================================

CREATE TABLE social_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feed_config_id UUID NOT NULL REFERENCES org_feed_configs(id) ON DELETE CASCADE,
  
  -- Event details
  event_type social_engagement_type NOT NULL,
  source_platform TEXT NOT NULL,
  source_post_id TEXT NOT NULL,
  source_post_url TEXT,
  
  -- Who engaged
  author_id TEXT NOT NULL,
  author_username TEXT,
  author_display_name TEXT,
  author_avatar_url TEXT,
  author_follower_count INTEGER,
  author_verified BOOLEAN DEFAULT false,
  
  -- Original post reference (what they engaged with)
  original_post_id TEXT,
  original_post_url TEXT,
  original_post_content TEXT,
  
  -- Engagement content
  content TEXT,
  content_html TEXT, -- Formatted version with links/mentions
  media_urls JSONB DEFAULT '[]'::jsonb,
  
  -- Processing state
  processed_at TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,
  notification_channel_ids JSONB DEFAULT '[]'::jsonb, -- Track where notifications were sent
  notification_message_ids JSONB DEFAULT '[]'::jsonb, -- Message IDs for reply detection
  
  -- Metadata
  raw_data JSONB, -- Store original API response
  engagement_metrics JSONB, -- likes, reposts on this engagement
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX social_engagement_events_org_idx ON social_engagement_events(organization_id);
CREATE INDEX social_engagement_events_feed_idx ON social_engagement_events(feed_config_id);
CREATE INDEX social_engagement_events_type_idx ON social_engagement_events(event_type);
CREATE INDEX social_engagement_events_created_idx ON social_engagement_events(created_at);
CREATE INDEX social_engagement_events_author_idx ON social_engagement_events(author_id);
CREATE UNIQUE INDEX social_engagement_events_unique ON social_engagement_events(feed_config_id, source_post_id);

-- =============================================================================
-- PENDING REPLY CONFIRMATIONS TABLE
-- =============================================================================

CREATE TABLE pending_reply_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- What we're replying to
  engagement_event_id UUID REFERENCES social_engagement_events(id) ON DELETE SET NULL,
  target_platform TEXT NOT NULL, -- Platform to post reply to
  target_post_id TEXT NOT NULL, -- Post ID to reply to
  target_post_url TEXT,
  
  -- Where the reply came from
  source_platform TEXT NOT NULL, -- 'discord', 'telegram', 'slack'
  source_channel_id TEXT NOT NULL,
  source_server_id TEXT, -- For Discord/Slack
  source_message_id TEXT NOT NULL,
  source_user_id TEXT NOT NULL,
  source_username TEXT,
  source_user_display_name TEXT,
  
  -- The proposed reply
  reply_content TEXT NOT NULL,
  reply_media_urls JSONB DEFAULT '[]'::jsonb,
  
  -- Confirmation state
  status reply_confirmation_status NOT NULL DEFAULT 'pending',
  confirmation_message_id TEXT, -- Message ID of the confirmation prompt
  confirmation_channel_id TEXT, -- Where the confirmation was sent
  
  -- Approval details
  confirmed_by_user_id TEXT,
  confirmed_by_username TEXT,
  confirmed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Result
  sent_post_id TEXT,
  sent_post_url TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pending_reply_confirmations_org_idx ON pending_reply_confirmations(organization_id);
CREATE INDEX pending_reply_confirmations_status_idx ON pending_reply_confirmations(status);
CREATE INDEX pending_reply_confirmations_expires_idx ON pending_reply_confirmations(expires_at) WHERE status = 'pending';
CREATE INDEX pending_reply_confirmations_engagement_idx ON pending_reply_confirmations(engagement_event_id);
CREATE INDEX pending_reply_confirmations_source_msg_idx ON pending_reply_confirmations(source_platform, source_channel_id, source_message_id);
CREATE INDEX pending_reply_confirmations_confirm_msg_idx ON pending_reply_confirmations(confirmation_message_id) WHERE confirmation_message_id IS NOT NULL;

-- =============================================================================
-- NOTIFICATION MESSAGE TRACKING TABLE
-- =============================================================================

-- Track notification messages to detect replies
CREATE TABLE social_notification_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_event_id UUID NOT NULL REFERENCES social_engagement_events(id) ON DELETE CASCADE,
  
  -- Where notification was sent
  platform TEXT NOT NULL, -- 'discord', 'telegram', 'slack'
  channel_id TEXT NOT NULL,
  server_id TEXT, -- For Discord/Slack
  message_id TEXT NOT NULL,
  
  -- For thread tracking
  thread_id TEXT, -- Thread/topic ID if applicable
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX social_notification_messages_org_idx ON social_notification_messages(organization_id);
CREATE INDEX social_notification_messages_engagement_idx ON social_notification_messages(engagement_event_id);
CREATE INDEX social_notification_messages_lookup_idx ON social_notification_messages(platform, channel_id, message_id);
CREATE UNIQUE INDEX social_notification_messages_unique ON social_notification_messages(engagement_event_id, platform, channel_id, message_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE org_feed_configs IS 'Configuration for monitoring external social platforms for engagement';
COMMENT ON TABLE social_engagement_events IS 'Tracked engagement events from monitored social accounts';
COMMENT ON TABLE pending_reply_confirmations IS 'Pending reply confirmations waiting for user approval';
COMMENT ON TABLE social_notification_messages IS 'Tracks notification messages for reply detection';

COMMENT ON COLUMN org_feed_configs.notification_channels IS 'JSON array of notification targets: [{platform, channelId, serverId?, connectionId?}]';
COMMENT ON COLUMN org_feed_configs.last_seen_id IS 'Cursor for pagination - platform-specific ID of last processed item';
COMMENT ON COLUMN social_engagement_events.notification_message_ids IS 'JSON object mapping platform to message IDs for reply detection';
COMMENT ON COLUMN pending_reply_confirmations.expires_at IS 'After this time, the confirmation is automatically rejected';
