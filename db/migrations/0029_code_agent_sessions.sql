-- Migration: 0029_code_agent_sessions
-- Creates tables for code agent sessions, snapshots, commands, and interpreter executions
-- NOTE: runtime_type currently only supports 'vercel'. Others reserved for future use.

-- Code Agent Sessions - Main session table
CREATE TABLE IF NOT EXISTS "code_agent_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Session identity
  "name" text,
  "description" text,
  
  -- Runtime configuration
  "runtime_type" text NOT NULL DEFAULT 'vercel',
  "runtime_id" text,
  "runtime_url" text,
  
  -- Session state
  "status" text NOT NULL DEFAULT 'creating',
  "status_message" text,
  "working_directory" text DEFAULT '/app',
  
  -- Environment
  "environment_variables" jsonb NOT NULL DEFAULT '{}',
  "secrets_loaded" jsonb NOT NULL DEFAULT '[]',
  
  -- Git state
  "git_state" jsonb,
  
  -- Capabilities
  "capabilities" jsonb NOT NULL DEFAULT '{"languages":["javascript","typescript","python","shell"],"hasGit":true,"hasDocker":false,"maxCpuSeconds":3600,"maxMemoryMb":2048,"maxDiskMb":10240,"networkAccess":true}',
  
  -- Snapshots
  "latest_snapshot_id" uuid,
  "snapshot_count" integer NOT NULL DEFAULT 0,
  "auto_snapshot_enabled" boolean NOT NULL DEFAULT true,
  "auto_snapshot_interval_seconds" integer NOT NULL DEFAULT 300,
  
  -- Usage tracking
  "cpu_seconds_used" integer NOT NULL DEFAULT 0,
  "memory_mb_peak" integer NOT NULL DEFAULT 0,
  "disk_mb_used" integer NOT NULL DEFAULT 0,
  "api_calls_count" integer NOT NULL DEFAULT 0,
  "commands_executed" integer NOT NULL DEFAULT 0,
  "files_created" integer NOT NULL DEFAULT 0,
  "files_modified" integer NOT NULL DEFAULT 0,
  
  -- Cost tracking
  "estimated_cost_cents" integer NOT NULL DEFAULT 0,
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "last_activity_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "suspended_at" timestamp,
  "terminated_at" timestamp,
  
  -- Metadata
  "metadata" jsonb DEFAULT '{}'
);

-- Code Agent Snapshots
CREATE TABLE IF NOT EXISTS "code_agent_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  "session_id" uuid NOT NULL REFERENCES "code_agent_sessions"("id") ON DELETE CASCADE,
  
  -- Snapshot identity
  "name" text,
  "description" text,
  "snapshot_type" text NOT NULL DEFAULT 'manual',
  
  -- Storage
  "storage_backend" text NOT NULL DEFAULT 'vercel_blob',
  "storage_key" text NOT NULL,
  
  -- Content metadata
  "file_count" integer NOT NULL DEFAULT 0,
  "total_size_bytes" integer NOT NULL DEFAULT 0,
  "file_manifest" jsonb DEFAULT '[]',
  
  -- Git state at snapshot time
  "git_state" jsonb,
  
  -- Environment at snapshot time
  "environment_variables" jsonb DEFAULT '{}',
  "working_directory" text,
  
  -- Validity
  "is_valid" boolean NOT NULL DEFAULT true,
  "validation_error" text,
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp
);

-- Code Agent Commands
CREATE TABLE IF NOT EXISTS "code_agent_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  "session_id" uuid NOT NULL REFERENCES "code_agent_sessions"("id") ON DELETE CASCADE,
  
  -- Command details
  "command_type" text NOT NULL,
  "command" text NOT NULL,
  "arguments" jsonb,
  
  -- Working directory at execution time
  "working_directory" text,
  
  -- Result
  "status" text NOT NULL DEFAULT 'pending',
  "exit_code" integer,
  "stdout" text,
  "stderr" text,
  "error_message" text,
  
  -- Files affected
  "files_created" jsonb DEFAULT '[]',
  "files_modified" jsonb DEFAULT '[]',
  "files_deleted" jsonb DEFAULT '[]',
  
  -- Execution metrics
  "duration_ms" integer,
  "cpu_time_ms" integer,
  "memory_mb_peak" integer,
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "completed_at" timestamp
);

-- Interpreter Executions (stateless quick code execution)
CREATE TABLE IF NOT EXISTS "interpreter_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  
  -- Execution details
  "language" text NOT NULL,
  "code" text NOT NULL,
  "packages" jsonb DEFAULT '[]',
  
  -- Result
  "status" text NOT NULL DEFAULT 'pending',
  "output" text,
  "error" text,
  "exit_code" integer,
  
  -- Metrics
  "duration_ms" integer,
  "memory_mb_peak" integer,
  
  -- Cost
  "cost_cents" integer NOT NULL DEFAULT 0,
  
  -- Timestamps
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);

-- Indexes for code_agent_sessions
CREATE INDEX IF NOT EXISTS "code_agent_sessions_org_idx" ON "code_agent_sessions" ("organization_id");
CREATE INDEX IF NOT EXISTS "code_agent_sessions_user_idx" ON "code_agent_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "code_agent_sessions_status_idx" ON "code_agent_sessions" ("status");
CREATE INDEX IF NOT EXISTS "code_agent_sessions_runtime_idx" ON "code_agent_sessions" ("runtime_id");
CREATE INDEX IF NOT EXISTS "code_agent_sessions_created_at_idx" ON "code_agent_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "code_agent_sessions_expires_at_idx" ON "code_agent_sessions" ("expires_at");

-- Indexes for code_agent_snapshots
CREATE INDEX IF NOT EXISTS "code_agent_snapshots_session_idx" ON "code_agent_snapshots" ("session_id");
CREATE INDEX IF NOT EXISTS "code_agent_snapshots_created_at_idx" ON "code_agent_snapshots" ("created_at");
CREATE INDEX IF NOT EXISTS "code_agent_snapshots_storage_key_idx" ON "code_agent_snapshots" ("storage_key");

-- Indexes for code_agent_commands
CREATE INDEX IF NOT EXISTS "code_agent_commands_session_idx" ON "code_agent_commands" ("session_id");
CREATE INDEX IF NOT EXISTS "code_agent_commands_status_idx" ON "code_agent_commands" ("status");
CREATE INDEX IF NOT EXISTS "code_agent_commands_created_at_idx" ON "code_agent_commands" ("created_at");

-- Indexes for interpreter_executions
CREATE INDEX IF NOT EXISTS "interpreter_executions_org_idx" ON "interpreter_executions" ("organization_id");
CREATE INDEX IF NOT EXISTS "interpreter_executions_user_idx" ON "interpreter_executions" ("user_id");
CREATE INDEX IF NOT EXISTS "interpreter_executions_language_idx" ON "interpreter_executions" ("language");
CREATE INDEX IF NOT EXISTS "interpreter_executions_created_at_idx" ON "interpreter_executions" ("created_at");

