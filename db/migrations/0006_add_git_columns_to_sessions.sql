-- Add git_branch and last_commit_sha columns to app_sandbox_sessions
-- These columns support Git-based storage for app code
ALTER TABLE "app_sandbox_sessions" ADD COLUMN IF NOT EXISTS "git_branch" text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_sandbox_sessions" ADD COLUMN IF NOT EXISTS "last_commit_sha" text;
