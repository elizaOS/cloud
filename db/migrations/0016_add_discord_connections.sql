-- Discord Connections table for gateway service
-- Tracks Discord bot connections and their pod assignments

CREATE TABLE IF NOT EXISTS "discord_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "app_id" uuid REFERENCES "apps"("id") ON DELETE SET NULL,
  "application_id" text NOT NULL,
  "bot_token_encrypted" text NOT NULL,
  "assigned_pod" text,
  "status" text NOT NULL DEFAULT 'pending',
  "error_message" text,
  "guild_count" integer DEFAULT 0,
  "events_received" integer DEFAULT 0,
  "events_routed" integer DEFAULT 0,
  "last_heartbeat" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "intents" integer DEFAULT 3276799,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS "discord_connections_organization_id_idx" ON "discord_connections" ("organization_id");
CREATE INDEX IF NOT EXISTS "discord_connections_app_id_idx" ON "discord_connections" ("app_id");
CREATE INDEX IF NOT EXISTS "discord_connections_application_id_idx" ON "discord_connections" ("application_id");
CREATE INDEX IF NOT EXISTS "discord_connections_assigned_pod_idx" ON "discord_connections" ("assigned_pod");
CREATE INDEX IF NOT EXISTS "discord_connections_status_idx" ON "discord_connections" ("status");
CREATE INDEX IF NOT EXISTS "discord_connections_is_active_idx" ON "discord_connections" ("is_active");
