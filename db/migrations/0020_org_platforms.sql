-- Migration: Organization Platforms
-- Description: Tables for the org app platform connections, todos, check-ins, and team members
-- 
-- This migration adds support for the org app which enables AI agents
-- to manage teams across Discord, Telegram, and the web.

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE org_platform_type AS ENUM ('discord', 'telegram', 'slack', 'twitter');
CREATE TYPE org_platform_status AS ENUM ('active', 'disconnected', 'error', 'pending');
CREATE TYPE org_agent_type AS ENUM ('community_manager', 'project_manager', 'dev_rel', 'liaison', 'social_media_manager');
CREATE TYPE org_todo_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE org_todo_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE org_checkin_frequency AS ENUM ('daily', 'weekdays', 'weekly', 'bi_weekly', 'monthly');
CREATE TYPE org_checkin_type AS ENUM ('standup', 'sprint', 'mental_health', 'project_status', 'retrospective');

-- =============================================================================
-- PLATFORM CONNECTIONS TABLE
-- =============================================================================

CREATE TABLE org_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connected_by UUID NOT NULL REFERENCES users(id),
  
  -- Platform info
  platform org_platform_type NOT NULL,
  platform_bot_id TEXT NOT NULL,
  platform_bot_username TEXT,
  platform_bot_name TEXT,
  
  -- Connection status
  status org_platform_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  last_health_check TIMESTAMP,
  
  -- OAuth data (for Discord)
  oauth_access_token_secret_id UUID,
  oauth_refresh_token_secret_id UUID,
  oauth_expires_at TIMESTAMP,
  oauth_scopes JSONB DEFAULT '[]'::jsonb,
  
  -- Bot token (for Telegram)
  bot_token_secret_id UUID,
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_platform_connections_org_idx ON org_platform_connections(organization_id);
CREATE INDEX org_platform_connections_platform_idx ON org_platform_connections(platform);
CREATE UNIQUE INDEX org_platform_connections_unique ON org_platform_connections(organization_id, platform, platform_bot_id);
CREATE INDEX org_platform_connections_status_idx ON org_platform_connections(status);

-- =============================================================================
-- PLATFORM SERVERS/GROUPS TABLE
-- =============================================================================

CREATE TABLE org_platform_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent connection
  connection_id UUID NOT NULL REFERENCES org_platform_connections(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Server/group info
  server_id TEXT NOT NULL,
  server_name TEXT,
  server_icon TEXT,
  member_count TEXT,
  
  -- Configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_agents JSONB DEFAULT '["community_manager", "project_manager"]'::jsonb,
  agent_settings JSONB,
  channel_mappings JSONB,
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_platform_servers_connection_idx ON org_platform_servers(connection_id);
CREATE INDEX org_platform_servers_org_idx ON org_platform_servers(organization_id);
CREATE INDEX org_platform_servers_server_id_idx ON org_platform_servers(server_id);
CREATE UNIQUE INDEX org_platform_servers_unique ON org_platform_servers(connection_id, server_id);
CREATE INDEX org_platform_servers_enabled_idx ON org_platform_servers(enabled);

-- =============================================================================
-- TODO ITEMS TABLE
-- =============================================================================

CREATE TABLE org_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id),
  
  -- Todo content
  title TEXT NOT NULL,
  description TEXT,
  status org_todo_status NOT NULL DEFAULT 'pending',
  priority org_todo_priority NOT NULL DEFAULT 'medium',
  
  -- Assignment
  assignee_platform_id TEXT,
  assignee_platform org_platform_type,
  assignee_name TEXT,
  
  -- Due date
  due_date TIMESTAMP,
  
  -- Platform source tracking
  source_platform TEXT,
  source_server_id TEXT,
  source_channel_id TEXT,
  source_message_id TEXT,
  
  -- Tags/categories
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Related resources
  related_checkin_id UUID,
  related_project TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX org_todos_org_idx ON org_todos(organization_id);
CREATE INDEX org_todos_status_idx ON org_todos(status);
CREATE INDEX org_todos_assignee_idx ON org_todos(assignee_platform_id, assignee_platform);
CREATE INDEX org_todos_due_date_idx ON org_todos(due_date);
CREATE INDEX org_todos_created_by_idx ON org_todos(created_by_user_id);

-- =============================================================================
-- CHECK-IN SCHEDULES TABLE
-- =============================================================================

CREATE TABLE org_checkin_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- Schedule config
  name TEXT NOT NULL,
  checkin_type org_checkin_type NOT NULL DEFAULT 'standup',
  frequency org_checkin_frequency NOT NULL DEFAULT 'weekdays',
  time_utc TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT DEFAULT 'UTC',
  
  -- Channels
  checkin_channel_id TEXT NOT NULL,
  report_channel_id TEXT,
  
  -- Questions/prompts
  questions JSONB DEFAULT '["What did you accomplish yesterday?", "What are you working on today?", "Any blockers?"]'::jsonb,
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_checkin_schedules_org_idx ON org_checkin_schedules(organization_id);
CREATE INDEX org_checkin_schedules_server_idx ON org_checkin_schedules(server_id);
CREATE INDEX org_checkin_schedules_enabled_idx ON org_checkin_schedules(enabled);
CREATE INDEX org_checkin_schedules_next_run_idx ON org_checkin_schedules(next_run_at);

-- =============================================================================
-- CHECK-IN RESPONSES TABLE
-- =============================================================================

CREATE TABLE org_checkin_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent schedule
  schedule_id UUID NOT NULL REFERENCES org_checkin_schedules(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Responder info
  responder_platform_id TEXT NOT NULL,
  responder_platform org_platform_type NOT NULL,
  responder_name TEXT,
  responder_avatar TEXT,
  
  -- Response content
  answers JSONB NOT NULL,
  
  -- Sentiment analysis
  sentiment_score TEXT,
  blockers_detected BOOLEAN DEFAULT false,
  blockers JSONB DEFAULT '[]'::jsonb,
  
  -- Source
  source_message_id TEXT,
  source_channel_id TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  checkin_date TIMESTAMP NOT NULL
);

CREATE INDEX org_checkin_responses_schedule_idx ON org_checkin_responses(schedule_id);
CREATE INDEX org_checkin_responses_org_idx ON org_checkin_responses(organization_id);
CREATE INDEX org_checkin_responses_responder_idx ON org_checkin_responses(responder_platform_id, responder_platform);
CREATE INDEX org_checkin_responses_date_idx ON org_checkin_responses(checkin_date);

-- =============================================================================
-- TEAM MEMBERS TABLE
-- =============================================================================

CREATE TABLE org_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES org_platform_servers(id) ON DELETE CASCADE,
  
  -- Member identity
  platform_user_id TEXT NOT NULL,
  platform org_platform_type NOT NULL,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  
  -- Role/status
  role TEXT,
  is_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Availability
  availability JSONB,
  
  -- Stats
  total_checkins TEXT DEFAULT '0',
  last_checkin_at TIMESTAMP,
  checkin_streak TEXT DEFAULT '0',
  
  -- Metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX org_team_members_org_idx ON org_team_members(organization_id);
CREATE INDEX org_team_members_server_idx ON org_team_members(server_id);
CREATE INDEX org_team_members_platform_user_idx ON org_team_members(platform_user_id, platform);
CREATE UNIQUE INDEX org_team_members_unique ON org_team_members(server_id, platform_user_id, platform);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE org_platform_connections IS 'Organization-level platform connections (Discord bots, Telegram bots, etc.)';
COMMENT ON TABLE org_platform_servers IS 'Individual servers/groups connected to a platform (Discord guilds, Telegram groups)';
COMMENT ON TABLE org_todos IS 'Todo items that can be created via web UI, Discord, or Telegram';
COMMENT ON TABLE org_checkin_schedules IS 'Check-in schedules for team coordination';
COMMENT ON TABLE org_checkin_responses IS 'Individual check-in responses from team members';
COMMENT ON TABLE org_team_members IS 'Team members tracked across platforms';

