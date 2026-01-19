-- Add telegram and email node types to workflow_node_type enum
ALTER TYPE workflow_node_type ADD VALUE IF NOT EXISTS 'telegram';
ALTER TYPE workflow_node_type ADD VALUE IF NOT EXISTS 'email';
