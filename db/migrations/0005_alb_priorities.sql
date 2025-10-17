-- Migration: Add ALB priorities table
-- Created: 2025-10-17
-- Purpose: Track ALB listener rule priorities for per-user container deployments

CREATE TABLE IF NOT EXISTS "alb_priorities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL UNIQUE,
  "priority" INTEGER NOT NULL UNIQUE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "alb_priorities_priority_range" CHECK ("priority" BETWEEN 1 AND 50000)
);

-- Index for cleanup queries (find expired priorities)
CREATE INDEX "idx_alb_priorities_expires_at" ON "alb_priorities"("expires_at") WHERE "expires_at" IS NOT NULL;

-- Index for user lookups
CREATE INDEX "idx_alb_priorities_user_id" ON "alb_priorities"("user_id");

-- Comment for documentation
COMMENT ON TABLE "alb_priorities" IS 'Tracks ALB listener rule priorities to prevent conflicts. Each user gets one unique priority (1-50000).';
COMMENT ON COLUMN "alb_priorities"."expires_at" IS 'Set when stack is deleted. Used for TTL cleanup of stale priorities.';

