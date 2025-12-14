-- Rollback: Performance Optimization Indexes Migration

-- rooms indexes
DROP INDEX IF EXISTS idx_rooms_agent_id;
DROP INDEX IF EXISTS idx_rooms_type;
DROP INDEX IF EXISTS idx_rooms_created_at;
DROP INDEX IF EXISTS idx_rooms_world_id;
DROP INDEX IF EXISTS idx_rooms_agent_type;

-- entities indexes
DROP INDEX IF EXISTS idx_entities_agent_id;
DROP INDEX IF EXISTS idx_entities_type;
DROP INDEX IF EXISTS idx_entities_created_at;

-- eliza_room_characters indexes
DROP INDEX IF EXISTS idx_eliza_room_characters_room_id;
DROP INDEX IF EXISTS idx_eliza_room_characters_character_id;

-- cache indexes
DROP INDEX IF EXISTS idx_cache_expires_at;
DROP INDEX IF EXISTS idx_cache_created_at;
DROP INDEX IF EXISTS idx_cache_agent_id;

-- memories indexes
DROP INDEX IF EXISTS idx_memories_entity_id;
DROP INDEX IF EXISTS idx_memories_agent_id;
DROP INDEX IF EXISTS idx_memories_room_id;
DROP INDEX IF EXISTS idx_memories_created_at;
DROP INDEX IF EXISTS idx_memories_room_type_agent;

-- participants indexes
DROP INDEX IF EXISTS idx_participants_entity_id;
DROP INDEX IF EXISTS idx_participants_agent_id;
DROP INDEX IF EXISTS idx_participants_created_at;
DROP INDEX IF EXISTS idx_participants_room_entity;

-- logs indexes
DROP INDEX IF EXISTS idx_logs_entity_id;
DROP INDEX IF EXISTS idx_logs_room_id;
DROP INDEX IF EXISTS idx_logs_agent_id;
DROP INDEX IF EXISTS idx_logs_type;
DROP INDEX IF EXISTS idx_logs_created_at;

-- components indexes
DROP INDEX IF EXISTS idx_components_entity_id;
DROP INDEX IF EXISTS idx_components_agent_id;
DROP INDEX IF EXISTS idx_components_room_id;

-- tasks indexes
DROP INDEX IF EXISTS idx_tasks_agent_id;
DROP INDEX IF EXISTS idx_tasks_room_id;
DROP INDEX IF EXISTS idx_tasks_created_at;

-- worlds indexes
DROP INDEX IF EXISTS idx_worlds_agent_id;

-- voice cloning indexes
DROP INDEX IF EXISTS idx_voice_cloning_jobs_org_id;
DROP INDEX IF EXISTS idx_voice_cloning_jobs_user_id;
DROP INDEX IF EXISTS idx_voice_cloning_jobs_user_voice_id;
DROP INDEX IF EXISTS idx_voice_cloning_jobs_status;
DROP INDEX IF EXISTS idx_voice_cloning_jobs_created_at;

DROP INDEX IF EXISTS idx_voice_samples_user_voice_id;
DROP INDEX IF EXISTS idx_voice_samples_job_id;
DROP INDEX IF EXISTS idx_voice_samples_org_id;
DROP INDEX IF EXISTS idx_voice_samples_user_id;

-- miniapp auth indexes
DROP INDEX IF EXISTS idx_miniapp_auth_sessions_user_id;
DROP INDEX IF EXISTS idx_miniapp_auth_sessions_org_id;
DROP INDEX IF EXISTS idx_miniapp_auth_sessions_expires_at;

-- other indexes
DROP INDEX IF EXISTS idx_organization_invites_inviter;
DROP INDEX IF EXISTS idx_organization_invites_accepted_by;
DROP INDEX IF EXISTS idx_generations_usage_record;
DROP INDEX IF EXISTS idx_jobs_api_key;
DROP INDEX IF EXISTS idx_jobs_user;
DROP INDEX IF EXISTS idx_jobs_generation;
DROP INDEX IF EXISTS idx_containers_api_key;

-- slow query log
DROP INDEX IF EXISTS idx_slow_query_log_hash;
DROP INDEX IF EXISTS idx_slow_query_log_avg_duration;
DROP INDEX IF EXISTS idx_slow_query_log_call_count;
DROP INDEX IF EXISTS idx_slow_query_log_last_seen;
DROP TABLE IF EXISTS slow_query_log;

