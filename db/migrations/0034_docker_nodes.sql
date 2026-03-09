-- Docker nodes table for tracking VPS infrastructure
CREATE TABLE IF NOT EXISTS docker_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT UNIQUE NOT NULL,
  hostname TEXT NOT NULL,
  ssh_port INTEGER NOT NULL DEFAULT 22,
  capacity INTEGER NOT NULL DEFAULT 8,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'unknown',
  allocated_count INTEGER NOT NULL DEFAULT 0,
  last_health_check TIMESTAMPTZ,
  ssh_user TEXT NOT NULL DEFAULT 'root',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS docker_nodes_node_id_idx ON docker_nodes(node_id);
CREATE INDEX IF NOT EXISTS docker_nodes_status_idx ON docker_nodes(status);
CREATE INDEX IF NOT EXISTS docker_nodes_enabled_idx ON docker_nodes(enabled);

-- Add docker infrastructure columns to milaidy_sandboxes
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS node_id TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS container_name TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS bridge_port INTEGER;
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS web_ui_port INTEGER;
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS headscale_ip TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN IF NOT EXISTS docker_image TEXT;

CREATE INDEX IF NOT EXISTS milaidy_sandboxes_node_id_idx ON milaidy_sandboxes(node_id);
