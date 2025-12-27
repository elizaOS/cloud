-- Migration: Managed Domains
-- Description: Add tables for domain management, purchase tracking, and moderation

-- Enums for domain management
DO $$ BEGIN
  CREATE TYPE domain_registrar AS ENUM ('vercel', 'external');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_nameserver_mode AS ENUM ('vercel', 'external');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_resource_type AS ENUM ('app', 'container', 'agent', 'mcp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_moderation_status AS ENUM ('clean', 'pending_review', 'flagged', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_status AS ENUM ('pending', 'active', 'expired', 'suspended', 'transferring');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_event_type AS ENUM (
    'name_check', 'auto_flag', 'admin_flag', 'health_check', 'content_scan',
    'user_report', 'suspension', 'reinstatement', 'dns_change',
    'assignment_change', 'verification', 'renewal', 'expiration_warning'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_event_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_event_detected_by AS ENUM ('system', 'admin', 'user_report', 'automated_scan', 'health_monitor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Managed Domains table
CREATE TABLE IF NOT EXISTS managed_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Domain name (lowercase, normalized)
  domain TEXT NOT NULL UNIQUE,
  
  -- Registration details
  registrar domain_registrar NOT NULL DEFAULT 'vercel',
  vercel_domain_id TEXT,
  registered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  status domain_status NOT NULL DEFAULT 'pending',
  
  -- Registrant info (for WHOIS)
  registrant_info JSONB,
  
  -- Resource assignment (polymorphic)
  resource_type domain_resource_type,
  app_id UUID REFERENCES apps(id) ON DELETE SET NULL,
  container_id UUID REFERENCES containers(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES user_characters(id) ON DELETE SET NULL,
  mcp_id UUID REFERENCES user_mcps(id) ON DELETE SET NULL,
  
  -- DNS configuration
  nameserver_mode domain_nameserver_mode NOT NULL DEFAULT 'vercel',
  dns_records JSONB DEFAULT '[]',
  ssl_status TEXT DEFAULT 'pending',
  ssl_expires_at TIMESTAMPTZ,
  
  -- Verification (for external domains)
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  
  -- Moderation
  moderation_status domain_moderation_status NOT NULL DEFAULT 'clean',
  moderation_flags JSONB DEFAULT '[]',
  
  -- Health monitoring
  last_health_check TIMESTAMPTZ,
  is_live BOOLEAN NOT NULL DEFAULT false,
  health_check_error TEXT,
  
  -- Pricing
  purchase_price TEXT,
  renewal_price TEXT,
  payment_method TEXT,
  stripe_payment_intent_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Domain moderation events table
CREATE TABLE IF NOT EXISTS domain_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES managed_domains(id) ON DELETE CASCADE,
  
  -- Event details
  event_type domain_event_type NOT NULL,
  severity domain_event_severity NOT NULL,
  description TEXT NOT NULL,
  
  -- Detection source
  detected_by domain_event_detected_by NOT NULL,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Evidence and context
  evidence JSONB,
  
  -- Action taken
  action_taken TEXT,
  previous_status TEXT,
  new_status TEXT,
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for managed_domains
CREATE INDEX IF NOT EXISTS managed_domains_org_idx ON managed_domains(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS managed_domains_domain_idx ON managed_domains(domain);
CREATE INDEX IF NOT EXISTS managed_domains_app_idx ON managed_domains(app_id);
CREATE INDEX IF NOT EXISTS managed_domains_container_idx ON managed_domains(container_id);
CREATE INDEX IF NOT EXISTS managed_domains_agent_idx ON managed_domains(agent_id);
CREATE INDEX IF NOT EXISTS managed_domains_mcp_idx ON managed_domains(mcp_id);
CREATE INDEX IF NOT EXISTS managed_domains_status_idx ON managed_domains(status);
CREATE INDEX IF NOT EXISTS managed_domains_moderation_idx ON managed_domains(moderation_status);
CREATE INDEX IF NOT EXISTS managed_domains_expires_idx ON managed_domains(expires_at);

-- Indexes for domain_moderation_events
CREATE INDEX IF NOT EXISTS domain_mod_events_domain_idx ON domain_moderation_events(domain_id);
CREATE INDEX IF NOT EXISTS domain_mod_events_type_idx ON domain_moderation_events(event_type);
CREATE INDEX IF NOT EXISTS domain_mod_events_severity_idx ON domain_moderation_events(severity);
CREATE INDEX IF NOT EXISTS domain_mod_events_created_idx ON domain_moderation_events(created_at);
CREATE INDEX IF NOT EXISTS domain_mod_events_unresolved_idx ON domain_moderation_events(resolved_at);

-- Add domain assignment column to containers (for quick lookups)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Add domain assignment column to user_characters (agents)
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE user_characters ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Add domain assignment column to user_mcps
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE user_mcps ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

