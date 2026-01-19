-- Migration: Add app-query workflow node type
-- This adds support for querying app data (users, stats, requests, analytics) in workflows

-- Add app-query to workflow_node_type enum
ALTER TYPE workflow_node_type ADD VALUE IF NOT EXISTS 'app-query';
