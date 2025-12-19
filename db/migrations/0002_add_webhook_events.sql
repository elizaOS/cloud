-- Migration: Add webhook_events table for replay attack prevention
-- This table tracks processed webhook events to prevent duplicate processing

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL UNIQUE,
	"provider" text NOT NULL,
	"event_type" text,
	"payload_hash" text NOT NULL,
	"source_ip" text,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"event_timestamp" timestamp
);

-- Indexes for efficient lookups and cleanup
CREATE INDEX IF NOT EXISTS "webhook_events_event_id_idx" ON "webhook_events" USING btree ("event_id");
CREATE INDEX IF NOT EXISTS "webhook_events_provider_idx" ON "webhook_events" USING btree ("provider");
CREATE INDEX IF NOT EXISTS "webhook_events_processed_at_idx" ON "webhook_events" USING btree ("processed_at");
CREATE INDEX IF NOT EXISTS "webhook_events_provider_processed_idx" ON "webhook_events" USING btree ("provider", "processed_at");

