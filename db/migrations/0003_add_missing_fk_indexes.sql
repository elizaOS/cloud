-- Migration: Add missing indexes for foreign key CASCADE performance
-- These indexes speed up CASCADE deletes on rooms and improve query performance

-- Index on logs.roomId for room CASCADE deletes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_logs_room_id" ON "logs" USING btree ("roomId");

-- Index on components.roomId for room CASCADE deletes  
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_components_room_id" ON "components" USING btree ("roomId");

-- Standalone index on memories.room_id (existing composite index type,room_id doesn't help for room-only lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_memories_room_id" ON "memories" USING btree ("room_id");

