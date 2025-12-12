-- Migration: Discord Gateway Multi-Tenant Support
-- Description: Tables for managing persistent Discord gateway connections and event routing
-- 
-- This migration adds support for the multi-tenant Discord gateway service
-- that maintains WebSocket connections to Discord and routes events to agents.

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE discord_connection_status AS ENUM (
  'connected',
  'disconnected', 
  'reconnecting',
  'error',
  'starting'
);

CREATE TYPE discord_event_type AS ENUM (
  'MESSAGE_CREATE',
  'MESSAGE_UPDATE',
  'MESSAGE_DELETE',
  'MESSAGE_REACTION_ADD',
  'MESSAGE_REACTION_REMOVE',
  'GUILD_MEMBER_ADD',
  'GUILD_MEMBER_REMOVE',
  'GUILD_MEMBER_UPDATE',
  'INTERACTION_CREATE',
  'VOICE_STATE_UPDATE',
  'PRESENCE_UPDATE',
  'TYPING_START',
  'CHANNEL_CREATE',
  'CHANNEL_UPDATE',
  'CHANNEL_DELETE',
  'THREAD_CREATE',
  'THREAD_UPDATE',
  'THREAD_DELETE'
);

CREATE TYPE discord_route_type AS ENUM (
  'a2a',
  'mcp', 
  'webhook',
  'container',
  'internal'
);

-- =============================================================================
-- DISCORD BOT CONNECTIONS TABLE
-- =============================================================================
-- Tracks the gateway connection state for each bot, including sharding info

CREATE TABLE discord_bot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to org platform connection
  platform_connection_id UUID NOT NULL REFERENCES org_platform_connections(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Bot identity
  application_id TEXT NOT NULL,
  bot_user_id TEXT,
  bot_username TEXT,
  
  -- Sharding (for large bots)
  shard_id INTEGER DEFAULT 0,
  shard_count INTEGER DEFAULT 1,
  
  -- Gateway connection state
  gateway_pod TEXT, -- Which K8s pod is handling this connection
  session_id TEXT, -- Discord gateway session for resume
  resume_gateway_url TEXT, -- Discord's recommended resume URL
  sequence_number INTEGER DEFAULT 0, -- Last event sequence for resume
  
  -- Connection status
  status discord_connection_status NOT NULL DEFAULT 'disconnected',
  error_message TEXT,
  last_heartbeat TIMESTAMP,
  heartbeat_interval_ms INTEGER DEFAULT 41250,
  
  -- Stats
  guild_count INTEGER DEFAULT 0,
  events_received BIGINT DEFAULT 0,
  events_routed BIGINT DEFAULT 0,
  last_event_at TIMESTAMP,
  
  -- Intents (bitmask for Discord gateway intents)
  intents INTEGER DEFAULT 3276799, -- Default: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT, etc.
  
  -- Timestamps
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX discord_bot_connections_org_idx ON discord_bot_connections(organization_id);
CREATE INDEX discord_bot_connections_platform_idx ON discord_bot_connections(platform_connection_id);
CREATE INDEX discord_bot_connections_app_id_idx ON discord_bot_connections(application_id);
CREATE INDEX discord_bot_connections_status_idx ON discord_bot_connections(status);
CREATE INDEX discord_bot_connections_shard_idx ON discord_bot_connections(shard_id, shard_count);
CREATE INDEX discord_bot_connections_pod_idx ON discord_bot_connections(gateway_pod);
CREATE UNIQUE INDEX discord_bot_connections_unique ON discord_bot_connections(platform_connection_id, shard_id);

-- =============================================================================
-- DISCORD EVENT ROUTES TABLE
-- =============================================================================
-- Configures how Discord events should be routed to agents

CREATE TABLE discord_event_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform_connection_id UUID NOT NULL REFERENCES org_platform_connections(id) ON DELETE CASCADE,
  
  -- Scope (which events to match)
  guild_id TEXT NOT NULL,
  channel_id TEXT, -- NULL = all channels in guild
  event_type discord_event_type NOT NULL,
  
  -- Route configuration
  route_type discord_route_type NOT NULL,
  route_target TEXT NOT NULL, -- Agent ID, URL, container ID, or character ID
  
  -- Filtering
  filter_bot_messages BOOLEAN DEFAULT true, -- Ignore messages from bots
  filter_self_messages BOOLEAN DEFAULT true, -- Ignore messages from this bot
  mention_only BOOLEAN DEFAULT false, -- Only route when bot is mentioned
  command_prefix TEXT, -- Only route messages starting with this prefix
  
  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_burst INTEGER DEFAULT 10,
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER DEFAULT 100, -- Higher = checked first
  
  -- Stats
  events_matched BIGINT DEFAULT 0,
  events_routed BIGINT DEFAULT 0,
  last_routed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX discord_event_routes_org_idx ON discord_event_routes(organization_id);
CREATE INDEX discord_event_routes_connection_idx ON discord_event_routes(platform_connection_id);
CREATE INDEX discord_event_routes_guild_idx ON discord_event_routes(guild_id);
CREATE INDEX discord_event_routes_channel_idx ON discord_event_routes(guild_id, channel_id);
CREATE INDEX discord_event_routes_type_idx ON discord_event_routes(event_type);
CREATE INDEX discord_event_routes_enabled_idx ON discord_event_routes(enabled);
CREATE INDEX discord_event_routes_priority_idx ON discord_event_routes(priority DESC);

-- =============================================================================
-- DISCORD MESSAGE QUEUE TABLE
-- =============================================================================
-- Temporary storage for events waiting to be processed (resilience)

CREATE TABLE discord_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event identification
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  route_id UUID REFERENCES discord_event_routes(id) ON DELETE SET NULL,
  
  -- Event data
  event_type discord_event_type NOT NULL,
  event_id TEXT NOT NULL, -- Discord's event ID (message ID, etc.)
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  
  -- Payload
  payload JSONB NOT NULL,
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, dead_letter
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  process_after TIMESTAMP DEFAULT NOW(), -- For delayed/retry processing
  completed_at TIMESTAMP
);

CREATE INDEX discord_event_queue_org_idx ON discord_event_queue(organization_id);
CREATE INDEX discord_event_queue_status_idx ON discord_event_queue(status);
CREATE INDEX discord_event_queue_process_idx ON discord_event_queue(status, process_after) WHERE status IN ('pending', 'processing');
CREATE INDEX discord_event_queue_event_idx ON discord_event_queue(event_id);

-- Auto-cleanup old completed events (keep for 24 hours for debugging)
-- In production, add a scheduled job to DELETE FROM discord_event_queue WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '24 hours'

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE discord_bot_connections IS 'Gateway connection state for Discord bots, including sharding and session resume info';
COMMENT ON TABLE discord_event_routes IS 'Configuration for routing Discord events to agents via A2A, MCP, webhooks, or containers';
COMMENT ON TABLE discord_event_queue IS 'Temporary queue for Discord events awaiting processing, provides resilience against failures';

COMMENT ON COLUMN discord_bot_connections.intents IS 'Discord gateway intents bitmask. Default 3276799 includes GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT';
COMMENT ON COLUMN discord_bot_connections.sequence_number IS 'Last event sequence number for gateway resume after disconnect';
COMMENT ON COLUMN discord_event_routes.mention_only IS 'When true, only routes messages that @mention the bot';
COMMENT ON COLUMN discord_event_routes.priority IS 'Route matching priority. Higher values checked first. Default 100';
