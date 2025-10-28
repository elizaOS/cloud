-- Create CLI auth sessions table
CREATE TABLE IF NOT EXISTS "cli_auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text NOT NULL UNIQUE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "api_key_id" uuid,
  "api_key_plain" text,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "authenticated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "cli_auth_sessions_session_id_idx" ON "cli_auth_sessions"("session_id");
CREATE INDEX IF NOT EXISTS "cli_auth_sessions_status_idx" ON "cli_auth_sessions"("status");
CREATE INDEX IF NOT EXISTS "cli_auth_sessions_user_id_idx" ON "cli_auth_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "cli_auth_sessions_expires_at_idx" ON "cli_auth_sessions"("expires_at");

