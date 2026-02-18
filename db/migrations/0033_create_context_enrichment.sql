-- Context Enrichment Table
-- Stores identity/environment context fetched from OAuth providers
-- Enables agent personalization based on user identity across platforms

CREATE TABLE IF NOT EXISTS context_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES platform_credentials(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure one enrichment record per connection
CREATE UNIQUE INDEX IF NOT EXISTS context_enrichment_unique_idx 
  ON context_enrichment(organization_id, platform, connection_id);

-- Fast lookups by connection_id
CREATE INDEX IF NOT EXISTS context_enrichment_connection_idx 
  ON context_enrichment(connection_id);
