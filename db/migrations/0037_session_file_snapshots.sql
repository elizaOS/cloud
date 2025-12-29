-- Session File Snapshots table for backup/restore functionality
CREATE TABLE IF NOT EXISTS "session_file_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_session_id" uuid NOT NULL REFERENCES "app_sandbox_sessions"("id") ON DELETE CASCADE,
  "file_path" text NOT NULL,
  "content" text NOT NULL,
  "content_hash" text NOT NULL,
  "file_size" integer DEFAULT 0 NOT NULL,
  "snapshot_type" text DEFAULT 'auto' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Session Restore History table for tracking restore operations
CREATE TABLE IF NOT EXISTS "session_restore_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_session_id" uuid NOT NULL REFERENCES "app_sandbox_sessions"("id") ON DELETE CASCADE,
  "old_sandbox_id" text,
  "new_sandbox_id" text,
  "files_restored" integer DEFAULT 0 NOT NULL,
  "restore_duration_ms" integer,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

-- Indexes for session_file_snapshots
CREATE INDEX IF NOT EXISTS "session_file_snapshots_session_idx" ON "session_file_snapshots" ("sandbox_session_id");
CREATE INDEX IF NOT EXISTS "session_file_snapshots_path_idx" ON "session_file_snapshots" ("sandbox_session_id", "file_path");
CREATE INDEX IF NOT EXISTS "session_file_snapshots_type_idx" ON "session_file_snapshots" ("sandbox_session_id", "snapshot_type");

-- Indexes for session_restore_history
CREATE INDEX IF NOT EXISTS "session_restore_history_session_idx" ON "session_restore_history" ("sandbox_session_id");
CREATE INDEX IF NOT EXISTS "session_restore_history_status_idx" ON "session_restore_history" ("status");
