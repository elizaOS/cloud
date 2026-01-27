# AI Workflow Builder - Project Context & State

> Generated: 2026-01-28
> Branch: `feature/ai-workflow-builder-connections`
> Total Files Changed: 74 files (+20,153 lines)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current State](#current-state)
3. [Files Changed](#files-changed)
4. [Database State](#database-state)
5. [Connected Services](#connected-services)
6. [What Works](#what-works)
7. [What Needs Work](#what-needs-work)
8. [UI Components](#ui-components)
9. [API Endpoints](#api-endpoints)
10. [Testing Status](#testing-status)

---

## Project Overview

**Vision**: Build an "AI Workflow Builder" platform where Eliza has a phone number and can orchestrate workflows across services (Gmail, Calendar, Notion, Linear) via AI-powered automation.

**Key Features**:
- Phone number routing (SMS/iMessage to AI agents)
- OAuth gateway for Google services
- AI-powered workflow generation using Claude
- Multi-channel messaging (Twilio SMS, Blooio iMessage)

---

## Current State

### Organization
- **ID**: `4fee4051-4a8e-4d29-95ef-3605b60e234d`
- **User Email**: samarthgugnani06@gmail.com

### Connected Services
| Service | Status | Account |
|---------|--------|---------|
| Google | ✅ Connected | samarthgugnani06@gmail.com |
| Twilio | ✅ Connected | +12318331981 |
| Blooio | ✅ Connected | API Key stored |

### Phone Number Mappings
| Phone Number | Provider | Agent |
|--------------|----------|-------|
| +12318331981 | Twilio | Phone Assistant |
| samarth.gugnani30@gmail.com | Blooio | Test iMessage Agent |

### Database Counts
| Table | Count |
|-------|-------|
| platform_credentials | 1 |
| secrets | 6 |
| agent_phone_numbers | 2 |
| phone_message_log | 3 |
| agents | 7 |
| generated_workflows | 0 |

---

## Files Changed (74 Total)

### API Routes (19 files)

#### Google OAuth
| File | Purpose |
|------|---------|
| `app/api/v1/google/oauth/route.ts` | Initiate OAuth flow |
| `app/api/v1/google/callback/route.ts` | Handle OAuth callback, store tokens |
| `app/api/v1/google/status/route.ts` | Check connection status |
| `app/api/v1/google/disconnect/route.ts` | Remove connection |

#### Twilio SMS
| File | Purpose |
|------|---------|
| `app/api/v1/twilio/connect/route.ts` | Store Twilio credentials |
| `app/api/v1/twilio/status/route.ts` | Check connection status |
| `app/api/v1/twilio/disconnect/route.ts` | Remove connection |

#### Blooio iMessage
| File | Purpose |
|------|---------|
| `app/api/v1/blooio/connect/route.ts` | Store Blooio API key |
| `app/api/v1/blooio/status/route.ts` | Check connection status |
| `app/api/v1/blooio/disconnect/route.ts` | Remove connection |

#### Phone Numbers
| File | Purpose |
|------|---------|
| `app/api/v1/phone-numbers/route.ts` | List/create phone mappings |
| `app/api/v1/phone-numbers/[id]/route.ts` | Get/update/delete mapping |

#### Workflows
| File | Purpose |
|------|---------|
| `app/api/v1/workflows/route.ts` | List workflows |
| `app/api/v1/workflows/generate/route.ts` | AI-generate new workflow |
| `app/api/v1/workflows/[id]/route.ts` | Get/update/delete workflow |
| `app/api/v1/workflows/[id]/execute/route.ts` | Execute a workflow |
| `app/api/v1/workflows/[id]/share/route.ts` | Share workflow as MCP |

#### Webhooks
| File | Purpose |
|------|---------|
| `app/api/webhooks/twilio/[orgId]/route.ts` | Receive Twilio SMS |
| `app/api/webhooks/blooio/[orgId]/route.ts` | Receive Blooio iMessage |

---

### Services (20 files)

#### Messaging Services
| File | Purpose |
|------|---------|
| `lib/services/blooio-automation/index.ts` | Blooio API client, credential management |
| `lib/services/twilio-automation/index.ts` | Twilio API client, credential management |
| `lib/services/message-router/index.ts` | Route messages to agents, log messages |

#### Google Services
| File | Purpose |
|------|---------|
| `lib/services/google-automation/index.ts` | Google API client, OAuth management |
| `lib/services/google-token/index.ts` | Token refresh, expiry management |

#### Workflow Engine (12 files)
| File | Purpose |
|------|---------|
| `lib/services/workflow-engine/index.ts` | Main exports |
| `lib/services/workflow-engine/workflow-factory.ts` | AI workflow generation using Claude |
| `lib/services/workflow-engine/registry.ts` | Workflow registry and management |
| `lib/services/workflow-engine/credential-validator.ts` | Validate credentials before execution |
| `lib/services/workflow-engine/dependency-resolver.ts` | Resolve workflow dependencies |
| `lib/services/workflow-engine/context-builder.ts` | Build execution context |
| `lib/services/workflow-engine/n8n-client.ts` | n8n integration client |
| `lib/services/workflow-engine/workflow-sharing.ts` | Share workflows as MCPs |
| `lib/services/workflow-engine/service-specs/index.ts` | Service specifications |
| `lib/services/workflow-engine/service-specs/google.ts` | Google service spec |
| `lib/services/workflow-engine/service-specs/twilio.ts` | Twilio service spec |
| `lib/services/workflow-engine/service-specs/blooio.ts` | Blooio service spec |
| `lib/services/workflow-engine/service-specs/notion.ts` | Notion service spec |
| `lib/services/workflow-engine/service-specs/types.ts` | Type definitions |

#### Workflow Executor
| File | Purpose |
|------|---------|
| `lib/services/workflow-executor/index.ts` | Execute generated workflows |

---

### UI Components (5 files)

| File | Purpose | Has UI? |
|------|---------|---------|
| `components/settings/google-connection.tsx` | Google OAuth connection card | ✅ Yes |
| `components/settings/twilio-connection.tsx` | Twilio connection form | ✅ Yes |
| `components/settings/blooio-connection.tsx` | Blooio connection form | ✅ Yes |
| `components/settings/phone-number-manager.tsx` | Phone-to-agent mapping | ✅ Yes |
| `components/settings/tabs/connections-tab.tsx` | Connections tab layout | ✅ Yes |

---

### Database (8 files)

#### Migrations
| File | Purpose |
|------|---------|
| `db/migrations/0018_add_generated_workflows.sql` | Workflows & executions tables |
| `db/migrations/0019_add_user_mcps.sql` | User MCPs table |
| `db/migrations/0020_add_agent_phone_numbers.sql` | Phone mappings & message log |

#### Schemas
| File | Purpose |
|------|---------|
| `db/schemas/agent-phone-numbers.ts` | Phone number Drizzle schema |
| `db/schemas/generated-workflows.ts` | Workflows Drizzle schema |
| `db/schemas/index.ts` | Schema exports |

#### Repositories
| File | Purpose |
|------|---------|
| `db/repositories/generated-workflows.ts` | Workflow data access |
| `db/repositories/index.ts` | Repository exports |

---

### Utilities (3 files)

| File | Purpose |
|------|---------|
| `lib/utils/blooio-api.ts` | Blooio API helpers, signature verification |
| `lib/utils/twilio-api.ts` | Twilio API helpers, signature verification |
| `lib/utils/google-api.ts` | Google API helpers |

---

### Tests (15 files)

#### Integration Tests
| File | What It Tests |
|------|---------------|
| `tests/integration/connection-apis.test.ts` | Connection API endpoints |
| `tests/integration/message-router.test.ts` | Message routing logic |
| `tests/integration/webhooks-e2e.test.ts` | Webhook handlers |
| `tests/integration/phone-mapping-e2e.test.ts` | Phone number management |
| `tests/integration/workflow-api.test.ts` | Workflow API endpoints |
| `tests/integration/workflow-e2e.test.ts` | End-to-end workflow tests |
| `tests/integration/workflow-execution.test.ts` | Workflow execution |
| `tests/integration/workflow-executor-e2e.test.ts` | Executor E2E tests |
| `tests/integration/workflow-sharing.test.ts` | Workflow sharing |

#### Unit Tests
| File | What It Tests |
|------|---------------|
| `tests/unit/workflow-engine/context-builder.test.ts` | Context building |
| `tests/unit/workflow-engine/dependency-resolver.test.ts` | Dependency resolution |
| `tests/unit/workflow-engine/service-specs.test.ts` | Service specifications |
| `tests/unit/workflow-engine/workflow-factory.test.ts` | AI generation |

#### Test Helpers
| File | Purpose |
|------|---------|
| `tests/infrastructure/index.ts` | Test infrastructure |
| `tests/infrastructure/workflow-test-helpers.ts` | Workflow test utilities |

---

### Other Files (4 files)

| File | Purpose |
|------|---------|
| `proxy.ts` | Added Google callback to public paths |
| `package.json` | Added @anthropic-ai/sdk dependency |
| `bun.lock` | Updated lockfile |
| `docs/USER_TESTING_GUIDE.md` | Testing documentation |

---

## What Works ✅

### Connections (UI Available)
- [x] Google OAuth flow - Connect/disconnect via UI
- [x] Twilio connection - Form in UI, credentials stored encrypted
- [x] Blooio connection - Form in UI, credentials stored encrypted
- [x] Connection status display - Shows connected state in UI

### Webhooks (Backend Only)
- [x] Twilio webhook receives SMS (requires signature in production)
- [x] Blooio webhook receives iMessage
- [x] Messages logged to `phone_message_log` table
- [x] Messages routed to correct agent based on phone number

### Phone Number Routing
- [x] Database schema for phone-to-agent mapping
- [x] API endpoints for CRUD operations
- [x] UI component for managing mappings

### Database
- [x] All migrations created and executed
- [x] Drizzle schemas defined
- [x] Repositories for data access

---

## What Needs Work 🔧

### UI Needed
| Feature | Current State | UI Needed |
|---------|---------------|-----------|
| Workflow Builder | API only | ❌ Need UI to create workflows |
| Workflow List | API only | ❌ Need UI to view/manage workflows |
| Workflow Execution | API only | ❌ Need UI to run workflows |
| Message Logs | Database only | ❌ Need UI to view message history |
| Agent Chat via Phone | Backend works | ❌ Need UI to see phone conversations |

### Backend Issues
| Issue | Description | Priority |
|-------|-------------|----------|
| Room Creation | Agent processing fails on room creation | High |
| Twilio Geo-Permissions | Account needs region enabled | Medium |
| Token Refresh | Google token refresh needs testing | Medium |

### Missing Features
| Feature | Description |
|---------|-------------|
| Workflow Templates | Pre-built workflow templates |
| Scheduled Workflows | Run workflows on schedule |
| Workflow Analytics | Track execution stats |
| Multi-Agent Routing | Route based on message content |

---

## API Endpoints Summary

### Connection APIs
```
POST   /api/v1/google/oauth          - Start Google OAuth
GET    /api/v1/google/callback       - OAuth callback
GET    /api/v1/google/status         - Check Google connection
DELETE /api/v1/google/disconnect     - Disconnect Google

POST   /api/v1/twilio/connect        - Connect Twilio
GET    /api/v1/twilio/status         - Check Twilio connection
DELETE /api/v1/twilio/disconnect     - Disconnect Twilio

POST   /api/v1/blooio/connect        - Connect Blooio
GET    /api/v1/blooio/status         - Check Blooio connection
DELETE /api/v1/blooio/disconnect     - Disconnect Blooio
```

### Phone Number APIs
```
GET    /api/v1/phone-numbers         - List phone mappings
POST   /api/v1/phone-numbers         - Create phone mapping
GET    /api/v1/phone-numbers/:id     - Get phone mapping
PUT    /api/v1/phone-numbers/:id     - Update phone mapping
DELETE /api/v1/phone-numbers/:id     - Delete phone mapping
```

### Workflow APIs
```
GET    /api/v1/workflows             - List workflows
POST   /api/v1/workflows/generate    - Generate workflow with AI
GET    /api/v1/workflows/:id         - Get workflow
PUT    /api/v1/workflows/:id         - Update workflow
DELETE /api/v1/workflows/:id         - Delete workflow
POST   /api/v1/workflows/:id/execute - Execute workflow
POST   /api/v1/workflows/:id/share   - Share as MCP
```

### Webhook Endpoints
```
POST   /api/webhooks/twilio/:orgId   - Receive Twilio SMS
GET    /api/webhooks/twilio/:orgId   - Health check
POST   /api/webhooks/blooio/:orgId   - Receive Blooio iMessage
GET    /api/webhooks/blooio/:orgId   - Health check
```

---

## Testing Status

### Manual Testing Done ✅
- [x] Google OAuth flow (connect/disconnect)
- [x] Twilio connection form
- [x] Blooio connection form
- [x] Webhook health checks
- [x] Blooio webhook message receiving
- [x] Message logging to database
- [x] Phone number to agent routing
- [x] UI connections page display

### Not Yet Tested ❌
- [ ] Full SMS flow (blocked by Twilio geo-permissions)
- [ ] Agent response generation
- [ ] Workflow generation with AI
- [ ] Workflow execution
- [ ] Google API calls (read email, create calendar event)
- [ ] Automated test suite

---

## Environment Variables Required

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Anthropic (for AI workflow generation)
ANTHROPIC_API_KEY=your_api_key

# Database
DATABASE_URL=postgresql://...

# Redis (for caching)
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token

# Encryption
SECRETS_MASTER_KEY=64_hex_characters (optional, defaults to zeros in dev)
```

---

## Next Steps Recommendations

### Priority 1: UI for Core Features
1. **Workflow Builder UI** - Visual interface to create workflows
2. **Message Log UI** - View conversation history
3. **Agent Phone Settings** - Per-agent phone configuration

### Priority 2: Fix Backend Issues
1. Fix room creation for agent processing
2. Add proper error handling for token refresh
3. Implement retry logic for webhook failures

### Priority 3: Enhanced Features
1. Workflow templates library
2. Scheduled workflow execution
3. Multi-channel agent responses (reply via same channel)

---

## Git Information

**Branch**: `feature/ai-workflow-builder-connections`
**Commits**: 9
**Remote**: https://github.com/elizaOS/eliza-cloud-v2

### Commit History
1. Add database schemas and migrations for AI workflow builder
2. Add automation services for messaging and workflows
3. Add API routes for connections, webhooks, and workflows
4. Add UI components for messaging connections
5. Add API utility helpers for external services
6. Add Google OAuth callback to public paths
7. Add integration and unit tests for workflow builder
8. Add user testing guide for AI workflow builder features
9. Add Anthropic SDK dependency for AI workflow generation
