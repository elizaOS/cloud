-- Performance Optimization Indexes Migration
-- Based on analysis showing high sequential scan ratios and missing indexes
-- 
-- Priority targets:
-- 1. Tables with >50% sequential scan ratio
-- 2. Foreign key columns without indexes
-- 3. Commonly filtered/sorted columns
--
-- Note: IF NOT EXISTS used for idempotency

-- ============================================================================
-- SLOW QUERY LOG TABLE (must be created first)
-- ============================================================================

CREATE TABLE IF NOT EXISTS slow_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  
  -- Aggregation fields
  call_count INTEGER NOT NULL DEFAULT 1,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_duration_ms INTEGER NOT NULL DEFAULT 0,
  max_duration_ms INTEGER NOT NULL DEFAULT 0,
  
  -- Context
  source_file TEXT,
  source_function TEXT,
  
  -- Timestamps
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Unique constraint on query hash for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_slow_query_log_hash ON slow_query_log(query_hash);

-- Index for finding slowest queries
CREATE INDEX IF NOT EXISTS idx_slow_query_log_avg_duration ON slow_query_log(avg_duration_ms DESC);

-- Index for finding most frequent slow queries
CREATE INDEX IF NOT EXISTS idx_slow_query_log_call_count ON slow_query_log(call_count DESC);

-- Index for recent slow queries
CREATE INDEX IF NOT EXISTS idx_slow_query_log_last_seen ON slow_query_log(last_seen_at DESC);

-- ============================================================================
-- CRITICAL: High Sequential Scan Tables
-- ============================================================================

-- rooms table: 66.89% seq scans, only has pkey
-- Columns: id, agentId, source, type, worldId, name, metadata, message_server_id, channel_id, created_at
CREATE INDEX IF NOT EXISTS idx_rooms_agent_id ON rooms("agentId");
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(type);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_world_id ON rooms("worldId");

-- entities table: 84.94% seq scans
-- Columns: id, agent_id, created_at, names, metadata
CREATE INDEX IF NOT EXISTS idx_entities_agent_id ON entities(agent_id);
CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities(created_at);

-- eliza_room_characters: 90.77% seq scans
-- Junction table needs composite index
CREATE INDEX IF NOT EXISTS idx_eliza_room_characters_room_id ON eliza_room_characters(room_id);
CREATE INDEX IF NOT EXISTS idx_eliza_room_characters_character_id ON eliza_room_characters(character_id);

-- cache table: 65.06% seq scans
-- Columns: key, agent_id, value, created_at, expires_at
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_agent_id ON cache(agent_id);

-- ============================================================================
-- FOREIGN KEY INDEXES: Critical for JOIN performance
-- ============================================================================

-- memories table: Critical for agent conversations
CREATE INDEX IF NOT EXISTS idx_memories_entity_id ON memories("entityId");
CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories("agentId");
CREATE INDEX IF NOT EXISTS idx_memories_room_id ON memories("roomId");
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories("createdAt");

-- participants table: Links entities to rooms
-- Columns: id, created_at, entityId, roomId, agentId, roomState
CREATE INDEX IF NOT EXISTS idx_participants_entity_id ON participants("entityId");
CREATE INDEX IF NOT EXISTS idx_participants_agent_id ON participants("agentId");
CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at);

-- logs table: 13MB with 5k+ rows, no indexes on FKs
-- Columns: id, created_at, entityId, body, type, roomId
CREATE INDEX IF NOT EXISTS idx_logs_entity_id ON logs("entityId");
CREATE INDEX IF NOT EXISTS idx_logs_room_id ON logs("roomId");
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- components table: FKs without indexes
CREATE INDEX IF NOT EXISTS idx_components_entity_id ON components("entityId");
CREATE INDEX IF NOT EXISTS idx_components_agent_id ON components("agentId");
CREATE INDEX IF NOT EXISTS idx_components_room_id ON components("roomId");

-- tasks table: FK to agents
-- Columns: id, name, description, roomId, worldId, entityId, tags, metadata, created_at, updated_at, agentId
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks("agentId");
CREATE INDEX IF NOT EXISTS idx_tasks_room_id ON tasks("roomId");
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- worlds table: FK to agents
CREATE INDEX IF NOT EXISTS idx_worlds_agent_id ON worlds("agentId");

-- ============================================================================
-- VOICE CLONING: 99%+ seq scans
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_org_id ON voice_cloning_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_user_id ON voice_cloning_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_user_voice_id ON voice_cloning_jobs(user_voice_id);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_status ON voice_cloning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_created_at ON voice_cloning_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_voice_samples_user_voice_id ON voice_samples(user_voice_id);
CREATE INDEX IF NOT EXISTS idx_voice_samples_job_id ON voice_samples(job_id);
CREATE INDEX IF NOT EXISTS idx_voice_samples_org_id ON voice_samples(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_samples_user_id ON voice_samples(user_id);

-- ============================================================================
-- MINIAPP AUTH: 98.10% seq scans
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_user_id ON miniapp_auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_org_id ON miniapp_auth_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_miniapp_auth_sessions_expires_at ON miniapp_auth_sessions(expires_at);

-- ============================================================================
-- OTHER HIGH-VALUE INDEXES
-- ============================================================================

-- organization_invites: Missing FK indexes
CREATE INDEX IF NOT EXISTS idx_organization_invites_inviter ON organization_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_accepted_by ON organization_invites(accepted_by_user_id);

-- generations: Missing usage_record_id FK index
CREATE INDEX IF NOT EXISTS idx_generations_usage_record ON generations(usage_record_id);

-- jobs: Missing FK indexes
CREATE INDEX IF NOT EXISTS idx_jobs_api_key ON jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_generation ON jobs(generation_id);

-- containers: Missing api_key FK
CREATE INDEX IF NOT EXISTS idx_containers_api_key ON containers(api_key_id);

-- ============================================================================
-- COMPOSITE INDEXES for common query patterns
-- ============================================================================

-- memories: Common lookup by room + type + agent
CREATE INDEX IF NOT EXISTS idx_memories_room_type_agent ON memories("roomId", type, "agentId");

-- rooms: Common lookup by agent + type
CREATE INDEX IF NOT EXISTS idx_rooms_agent_type ON rooms("agentId", type);

-- participants: Common lookup by room + entity
CREATE INDEX IF NOT EXISTS idx_participants_room_entity ON participants("roomId", "entityId");

-- ============================================================================
-- COMMENTS (for slow_query_log table created above)
-- ============================================================================

COMMENT ON TABLE slow_query_log IS 'Tracks slow database queries (>50ms) for performance optimization';
COMMENT ON COLUMN slow_query_log.query_hash IS 'MD5 hash of normalized SQL for deduplication';
COMMENT ON COLUMN slow_query_log.call_count IS 'Number of times this query was logged as slow';
COMMENT ON COLUMN slow_query_log.avg_duration_ms IS 'Running average execution time';

