-- Migration: Add Analytics Performance Indexes
-- Purpose: Optimize analytics queries for time-series, breakdowns, and aggregations
-- Date: 2025-10-13

-- Index 1: Primary composite index for time-series queries
-- Optimizes queries that filter by organization and order by time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_time
ON "usage_records" USING btree ("organization_id", "created_at" DESC);
--> statement-breakpoint

-- Index 2: Provider breakdown queries
-- Optimizes GROUP BY provider queries with cost/token aggregations
-- INCLUDE clause adds commonly accessed columns to avoid table lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_provider
ON "usage_records" USING btree ("organization_id", "provider")
INCLUDE ("input_cost", "output_cost", "input_tokens", "output_tokens", "is_successful");
--> statement-breakpoint

-- Index 3: Model breakdown queries
-- Optimizes GROUP BY model, provider queries with aggregations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_model
ON "usage_records" USING btree ("organization_id", "model", "provider")
INCLUDE ("input_cost", "output_cost", "input_tokens", "output_tokens", "is_successful");
--> statement-breakpoint

-- Index 4: User breakdown queries (partial index)
-- Only indexes rows where user_id is not null to save space
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_user
ON "usage_records" USING btree ("organization_id", "user_id")
WHERE "user_id" IS NOT NULL;
--> statement-breakpoint

-- Index 5: API Key breakdown queries (partial index)
-- Only indexes rows where api_key_id is not null
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_apikey
ON "usage_records" USING btree ("organization_id", "api_key_id")
WHERE "api_key_id" IS NOT NULL;
--> statement-breakpoint

-- Index 6: Time-range filtered queries with common aggregations
-- Covers common analytics queries filtering by org and time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_time_range
ON "usage_records" USING btree ("organization_id", "created_at")
INCLUDE ("input_cost", "output_cost", "input_tokens", "output_tokens", "is_successful", "provider", "model");
