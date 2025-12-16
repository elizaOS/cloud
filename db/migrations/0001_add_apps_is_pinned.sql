-- Add is_pinned column to apps table for priority display ordering
ALTER TABLE "apps" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "apps_is_pinned_idx" ON "apps" USING btree ("is_pinned");
