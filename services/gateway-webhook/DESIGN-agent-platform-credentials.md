# Agent Platform Credentials — Design

## Mental Model

Every platform integration (Telegram bot, Twilio number, WhatsApp, Blooio) belongs to an **agent**, not to an org. The org is just the owner/billing entity.

```
Agent "Luna" (agent_id: abc-123)
├── Telegram bot: @LunaAI_bot (token stored in secrets)
├── Twilio number: +1-555-0100 (stored in agent_phone_numbers)
└── WhatsApp: +1-555-0200 (token stored in secrets)
```

## URL Pattern

```
/webhook/:project/:platform              → shared bot (env vars, default agent)
/webhook/:project/:platform/:agentId     → per-agent bot (DB secrets)
```

## Current Implementation (Option A — ship now)

Reuse the existing `secrets` table with `project_id = agentId`:

```
secretsService.get(organizationId, "TELEGRAM_BOT_TOKEN", agentId)
```

- `secrets.organization_id` = agent's org (resolved via `user_characters`)
- `secrets.name` = credential key (e.g., `TELEGRAM_BOT_TOKEN`)
- `secrets.project_id` = `agentId`
- `secrets.project_type` = `"character"`

### Flow

```
Gateway receives POST /webhook/cloud/telegram/abc-123
  │
  ├─ resolveWebhookConfig(redis, cloudUrl, auth, "telegram", "cloud", agentId="abc-123")
  │     │
  │     └─ GET /api/internal/webhook/config?agentId=abc-123&platform=telegram
  │           │
  │           ├─ characterService.getById("abc-123") → { organization_id: "org-456" }
  │           ├─ secretsService.get("org-456", "TELEGRAM_BOT_TOKEN", "abc-123")
  │           ├─ secretsService.get("org-456", "TELEGRAM_WEBHOOK_SECRET", "abc-123")
  │           └─ return { agentId, botToken, webhookSecret }
  │
  ├─ adapter.verifyWebhook()
  ├─ adapter.extractEvent()
  ├─ dedup
  ├─ resolveAgentServer(redis, "abc-123") → pod URL
  ├─ forwardToServer() → response
  └─ adapter.sendReply()
```

### Pros
- Zero migration (secrets table already has project_id)
- Full AES-256-GCM encryption
- Audit logging via secret_audit_log
- Works today

### Cons
- `secrets.project_type` doesn't have `"agent"` — we use `"character"` which is semantically close but not perfect
- No structured metadata (bot username, status, health check) — just raw credential storage
- Phone numbers still in separate `agent_phone_numbers` table

## Target Design (Option B — future)

New `agent_platform_credentials` table:

```sql
CREATE TABLE agent_platform_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  platform TEXT NOT NULL, -- 'telegram' | 'blooio' | 'twilio' | 'whatsapp' | 'discord'

  -- Credential references (FK to secrets table)
  bot_token_secret_id UUID REFERENCES secrets(id),
  api_key_secret_id UUID REFERENCES secrets(id),
  webhook_secret_secret_id UUID REFERENCES secrets(id),

  -- Platform identity
  platform_bot_id TEXT,        -- Telegram bot user ID, WhatsApp phone number ID
  platform_bot_username TEXT,  -- @bot_username
  platform_bot_name TEXT,      -- Display name

  -- Phone number (for Twilio/Blooio/WhatsApp)
  phone_number TEXT,           -- E.164 format
  provider_phone_id TEXT,      -- Provider-specific SID

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disconnected' | 'error'
  error_message TEXT,
  last_health_check TIMESTAMP,

  -- Webhook
  webhook_url TEXT,
  webhook_configured BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(agent_id, platform)
);
```

### Benefits over Option A
- Single source of truth for all agent platform integrations
- Structured metadata (bot username, status, health check)
- Replaces `agent_phone_numbers` (phone numbers become a field, not a separate table)
- Clean query: `SELECT * FROM agent_platform_credentials WHERE agent_id = $1 AND platform = 'telegram'`
- Proper FK to secrets for encrypted credentials
- Unique constraint enforces one integration per agent per platform

### Migration path
1. Create `agent_platform_credentials` table
2. Migrate `agent_phone_numbers` data into it
3. Update Cloud API to use new table
4. Deprecate `agent_phone_numbers`
