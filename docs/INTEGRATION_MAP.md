# ElizaCloud ↔ Milady-Cloud Integration Map

**Last Updated:** 2026-03-08  
**Purpose:** Reference document mapping the integration surface between ElizaCloud (Next.js platform) and milady-cloud (Express backend).

---

## Table of Contents

1. [Overview](#overview)
2. [Auth Flow](#1-auth-flow)
3. [Credits & Billing](#2-credits--billing)
4. [Sandbox Lifecycle](#3-sandbox-lifecycle)
5. [API Surface](#4-api-surface)
6. [Data Model](#5-data-model)
7. [Infrastructure](#6-infrastructure)
8. [Integration Gaps & Recommendations](#7-integration-gaps--recommendations)

---

## Overview

### Platform Roles

**ElizaCloud** (`/home/shad0w/projects/eliza-cloud-v2/`)
- **Framework:** Next.js 14 (App Router, RSC, Server Actions)
- **Auth:** Privy (OAuth/wallet) + API keys
- **Billing:** Credit-based system (Stripe integration)
- **Database:** PostgreSQL (Drizzle ORM)
- **Primary Role:** User-facing platform, billing orchestrator, milady sandbox orchestration

**milady-cloud** (`/home/shad0w/projects/milady-cloud/backend/`)
- **Framework:** Express.js
- **Auth:** JWT + ElizaCloud API key validation
- **Billing:** Stripe subscription model (legacy)
- **Database:** PostgreSQL (raw SQL)
- **Primary Role:** Legacy container orchestration, may consume ElizaCloud credits for sandboxes

### Integration Model

```
User → ElizaCloud (auth, billing, sandbox orchestration)
         ↓ (API key validation)
       milady-cloud (legacy backend, container runtime)
```

---

## 1. Auth Flow

### 1.1 ElizaCloud Auth (Primary Platform)

**File:** `lib/auth.ts`

#### Session-Based (Cookie)
```typescript
// Privy session flow
1. User authenticates via Privy (OAuth/wallet)
2. Privy sets privy-token cookie (JWT)
3. ElizaCloud verifies token via Privy API (cached in Redis)
4. User synced to DB by privy_id (JIT sync if webhooks lag)
5. User mapped to organization_id
```

**Functions:**
- `getCurrentUser()`: Main auth entrypoint (cached, React `cache`)
- `requireAuth()`: Enforces authentication (allows anonymous)
- `requireAuthWithOrg()`: Enforces auth + org (for paid features)

#### API Key-Based
```typescript
// API key flow
1. User generates API key in ElizaCloud dashboard
2. Key stored in api_keys table (hashed with bcrypt)
3. Client sends key in X-API-Key or Authorization: Bearer
4. ElizaCloud validates against DB
5. Returns UserWithOrganization
```

**Functions:**
- `requireAuthOrApiKey()`: Dual auth (session or key)
- `requireAuthOrApiKeyWithOrg()`: Dual auth + org requirement

#### Token Caching Strategy
- **Privy tokens:** 5min TTL (Redis + in-memory LRU)
- **User sessions:** 5min TTL (Redis)
- **Cache invalidation:** On logout, explicit flush

**Files:**
- `lib/auth.ts` (main auth logic)
- `lib/auth/privy-client.ts` (Privy SDK wrapper + caching)
- `lib/cache/keys.ts` (cache key patterns)

---

### 1.2 milady-cloud Auth (Consumer Platform)

**File:** `middleware/auth.ts`

#### ElizaCloud API Key Validation
```typescript
// How milady-cloud validates ElizaCloud keys
1. Extract Authorization: Bearer {key}
2. Check format: must start with 'eliza_'
3. Call ElizaCloud /api/v1/models endpoint with key
4. If 200 OK → key valid, proceed
5. Lookup user_id from api_keys table by key_prefix + hash match
6. If key not in DB → auto-create user account
7. Attach req.elizaCloudApiKey, req.userId
```

**Key Function:**
```typescript
async function verifyApiKeyWithElizaCloud(apiKey: string): Promise<boolean> {
  const response = await fetch(`${ELIZACLOUD_API_URL}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  return response.ok;
}
```

**Auto-User Creation:**
- If key valid but not in DB → creates user with random handle
- Stores encrypted key + bcrypt hash in api_keys table
- Enables seamless onboarding from ElizaCloud

#### JWT Flow (Legacy)
```typescript
// milady-cloud's own JWT system
validateUserJWT(): JWT from signup/login endpoints
- Used for web dashboard auth
- Separate from ElizaCloud auth
```

**Functions:**
- `validateAuth()`: Dual middleware (JWT or ElizaCloud key)
- `validateUserJWT()`: JWT-only validation
- `validateElizaCloudKey()`: ElizaCloud key-only validation
- `optionalAuth()`: Public endpoints with optional auth

---

### 1.3 User Identity Mapping

| ElizaCloud                  | milady-cloud                     | Link                          |
|-----------------------------|----------------------------------|-------------------------------|
| users.id (UUID)             | users.id (UUID)                  | API key → user_id             |
| users.privy_id (did:privy:) | N/A                              | ElizaCloud-only               |
| organizations.id (UUID)     | N/A                              | ElizaCloud-only               |
| api_keys.key_hash (bcrypt)  | api_keys.key_hash (bcrypt)       | Shared validation             |
| users.email                 | users.email                      | May differ (auto-created)     |

**Key Insight:**  
milady-cloud does NOT store organization_id. Users are identified solely by user_id, which is linked via API key. There is no concept of "organization" in milady-cloud.

---

### 1.4 Integration Gaps

#### ❌ Missing: Direct Organization Mapping
- milady-cloud has no organization_id concept
- Cannot enforce org-level quotas or billing
- **Workaround:** ElizaCloud must enforce quotas before allowing milady-cloud calls

#### ❌ Missing: Shared Session Store
- ElizaCloud sessions (Privy) != milady-cloud sessions (JWT)
- Users must authenticate separately to both platforms
- **Workaround:** Use API keys as shared auth token

#### ✅ Working: API Key as Bridge
- ElizaCloud API key validates on both platforms
- milady-cloud trusts ElizaCloud's /models validation
- Auto-user creation prevents auth failures

#### 🔒 Security Risks
1. **Token Leakage:** milady-cloud logs may expose API keys if not sanitized
2. **Rate Limiting:** No shared rate-limit store between platforms
3. **Key Rotation:** Revoking key in ElizaCloud doesn't propagate to milady-cloud DB
4. **Auto-User Creation:** Creates orphan users in milady-cloud if key revoked

**Recommendations:**
- Implement webhook from ElizaCloud → milady-cloud for key revocations
- Add organization_id to milady-cloud schema for future billing integration
- Share Redis for rate-limiting across platforms
- Add API key audit log to track cross-platform usage

---

## 2. Credits & Billing

### 2.1 ElizaCloud Credit System

**Primary Files:**
- `lib/services/credits.ts`
- `lib/pricing-constants.ts`
- `db/schemas/credit-transactions.ts`
- `db/schemas/organizations.ts`

#### Credit Model
```typescript
// Credits stored as numeric(10,2) (USD dollars)
organizations.credit_balance: Decimal (e.g., "25.50")

// All operations use atomic transactions
credits.deductCredits({
  organizationId, amount, description, metadata
}) → { success, newBalance, transaction }

credits.addCredits({
  organizationId, amount, description, stripePaymentIntentId
}) → { transaction, newBalance }
```

#### Reservation System (Reserve-and-Reconcile)
```typescript
// Reserve credits before operation (prevents overspend)
const reservation = await credits.reserve({
  organizationId, userId, description,
  model: "gpt-4", estimatedInputTokens: 1000, estimatedOutputTokens: 500
});

// Operation executes...
const actualCost = calculateActualCost(response);

// Reconcile: refund or charge difference
await reservation.reconcile(actualCost);
```

**Buffer Multiplier:** 1.5x (50% over-estimate, configurable via `CREDIT_COST_BUFFER`)

#### Transaction Types
| Type       | Sign | Description                              |
|------------|------|------------------------------------------|
| `credit`   | +    | Stripe payment, admin credit grant       |
| `debit`    | -    | AI inference, sandbox, image generation  |
| `refund`   | +    | Failed operation, over-reservation       |

#### Auto Top-Up
```typescript
// Triggered when balance < threshold after deduction
organizations.auto_top_up_enabled: boolean
organizations.auto_top_up_amount: numeric
organizations.auto_top_up_threshold: numeric
organizations.auto_top_up_subscription_id: text (Stripe)
```

**Cron:** `app/api/cron/auto-top-up/route.ts` (every 5 minutes)

---

### 2.2 ElizaCloud Pricing Model

**File:** `lib/pricing-constants.ts`

```typescript
// Platform markup: 20% on all costs
PLATFORM_MARKUP_MULTIPLIER = 1.2

// Service costs (in USD, post-markup)
IMAGE_GENERATION_COST = 0.01          // $0.01 per image
VIDEO_GENERATION_COST = 0.05          // $0.05 per video
TTS_COST_PER_1K_CHARS = 0.029         // ~$0.029 per 1K chars
STT_COST_PER_MINUTE = 0.004           // ~$0.004 per minute
VOICE_CLONE_INSTANT_COST = 0.50       // ~$0.50 (1-3min audio)
VOICE_CLONE_PROFESSIONAL_COST = 2.00  // ~$2.00 (30+ min audio)

// AI model pricing: dynamic per-token costs
// Fetched from model_pricing table
```

**Model Pricing:**
- Stored in `model_pricing` table (provider, model, input_cost_per_token, output_cost_per_token)
- Updated via admin panel or Prisma migrations
- Used by `lib/pricing.ts` → `calculateCost()`

---

### 2.3 milady-cloud Billing (Legacy)

**File:** `routes/billing.ts`

#### Stripe Subscription Model
```typescript
// Tier-based subscriptions (not credit-based)
Tiers:
- free: $0/mo (1 agent, 8 shared slots)
- pro: $10/mo (3 agents, dedicated resources)
- team: $50/mo (10 agents, custom models, API access)

// Stored in user_subscriptions table
{
  user_id, tier, stripe_customer_id, stripe_subscription_id,
  status, current_period_start, current_period_end
}
```

#### Stripe Webhook Events
- `customer.subscription.created/updated` → Update tier
- `customer.subscription.deleted` → Downgrade to free
- `invoice.payment_succeeded` → Set active
- `invoice.payment_failed` → Set past_due

**Key Difference:**  
milady-cloud uses **subscription tiers** (monthly fixed cost), not **pay-per-use credits**. This is a legacy billing model.

---

### 2.4 Credit Flow: ElizaCloud → milady-cloud

**Current State:**  
There is NO credit flow integration. They operate independently.

**Proposed Flow:**

```
ElizaCloud (credit wallet) → milady-cloud (sandbox consumer)

1. User calls milady-cloud /agents (with ElizaCloud API key)
2. milady-cloud estimates sandbox cost (e.g., $0.10/day)
3. milady-cloud calls ElizaCloud /api/v1/credits/reserve
   POST /api/v1/credits/reserve
   { organizationId, amount: 0.10, description: "Sandbox reservation" }
4. ElizaCloud reserves credits, returns reservationId
5. milady-cloud provisions sandbox
6. Daily cron charges actual cost via /api/v1/credits/deduct
7. On sandbox deletion, refunds unused credits
```

**API Endpoints Needed (ElizaCloud):**
- `POST /api/v1/credits/reserve` (reserve credits, return reservation ID)
- `POST /api/v1/credits/deduct` (charge actual cost)
- `POST /api/v1/credits/refund` (return unused credits)
- `GET /api/v1/credits/balance` (✅ already exists)

**Status:** 🔴 NOT IMPLEMENTED

---

### 2.5 Container Billing (ElizaCloud)

**File:** `app/api/cron/container-billing/route.ts`

#### Daily Container Charges
```typescript
// Cron runs daily to charge for running containers
1. Fetch all containers with status = "running"
2. For each container:
   - Calculate daily cost (based on tier: basic $0.10, premium $0.25)
   - Deduct credits from organization_id
   - If insufficient credits → pause container
   - Record transaction with metadata
```

**Container Tiers:**
| Tier      | Daily Cost | Description                  |
|-----------|------------|------------------------------|
| `basic`   | $0.10      | Shared resources             |
| `premium` | $0.25      | Dedicated CPU/RAM            |

**Schedule:** Daily at 00:00 UTC (Vercel Cron)

**Note:** This is for ElizaCloud's own container service, NOT milady-cloud sandboxes.

---

### 2.6 Integration Gaps

#### ❌ Missing: Unified Credit System
- milady-cloud has no credit balance concept
- Uses subscription tiers instead
- Cannot bill per-usage for sandboxes

#### ❌ Missing: Credit Reservation API
- ElizaCloud has reserve/reconcile internally
- Not exposed as public API endpoint
- milady-cloud cannot pre-reserve credits

#### ❌ Missing: Cross-Platform Credit Sync
- No webhook from ElizaCloud → milady-cloud on low credits
- milady-cloud cannot check balance before provisioning
- Risk of sandbox provisioning without payment

#### 🔴 Critical Gap: Payment Before Provision
- milady-cloud provisions sandboxes without checking ElizaCloud balance
- Can create unpaid sandboxes if ElizaCloud balance = $0
- **Workaround:** Add balance check in milady-cloud before provisioning

**Recommendations:**
1. **Implement Credit Reservation API** (high priority)
   - `POST /api/v1/credits/reserve` → reserve amount, return token
   - `POST /api/v1/credits/reconcile` → adjust based on actual usage
   - `GET /api/v1/credits/balance` → check before provisioning (✅ exists)

2. **Add Organization ID to milady-cloud**
   - Track which ElizaCloud org owns each sandbox
   - Enable org-level quotas and billing

3. **Implement Webhook for Low Credits**
   - ElizaCloud → milady-cloud webhook on balance < threshold
   - milady-cloud pauses sandboxes to prevent overspend

4. **Migrate milady-cloud to Credit-Based Billing**
   - Deprecate Stripe subscriptions in milady-cloud
   - Use ElizaCloud as single source of truth for billing

---

## 3. Sandbox Lifecycle

### 3.1 Milady Sandbox Flow (ElizaCloud)

**Primary File:** `lib/services/milady-sandbox.ts`

#### Architecture
```
MiladySandboxService (orchestrator)
  ↓ delegates to
SandboxProvider (interface)
  ↓ implements
- VercelSandboxProvider (serverless sandboxes)
- DockerSandboxProvider (VPS containers)
```

#### Lifecycle States
```
pending → provisioning → running → stopped/disconnected/error
```

#### Provision Flow
```typescript
1. CREATE: miladySandboxService.createAgent({
     organizationId, userId, agentName, agentConfig, environmentVars
   }) → creates DB record (status: pending)

2. PROVISION: miladySandboxService.provision(agentId, orgId)
   a. Lock: trySetProvisioning (prevent race conditions)
   b. Database: provisionNeon() → Neon Postgres project + connection string
   c. Sandbox: provider.create({
        agentId, agentName, environmentVars: { DATABASE_URL, ... },
        snapshotId (optional)
      }) → returns { sandboxId, bridgeUrl, healthUrl }
   d. Health Check: provider.checkHealth(healthUrl) → wait for /health endpoint
   e. Restore Backup: if backup exists, pushState(bridgeUrl, backupData)
   f. Update DB: status = "running", store URLs, sandbox_id

3. BRIDGE: miladySandboxService.bridge(agentId, orgId, rpc)
   POST {bridgeUrl}/bridge
   { jsonrpc: "2.0", method: "...", params: {...} }

4. SNAPSHOT: miladySandboxService.snapshot(agentId, orgId, type)
   GET {bridgeUrl}/api/snapshot → returns { memories, config, workspaceFiles }
   Store in milady_sandbox_backups table
   Prune old backups (keep last 10)

5. SHUTDOWN: miladySandboxService.shutdown(agentId, orgId)
   a. Create pre-shutdown backup
   b. provider.stop(sandbox_id) → graceful shutdown
   c. Update DB: status = "stopped", clear URLs
```

#### Backup System
```typescript
// Backup types
type MiladyBackupSnapshotType = "auto" | "manual" | "pre-shutdown";

// Backup data structure
interface MiladyBackupStateData {
  memories: Array<{ role, text, timestamp }>;
  config: Record<string, unknown>;
  workspaceFiles: Record<string, string>;
}

// Stored in milady_sandbox_backups table
{ id, sandbox_record_id, snapshot_type, state_data, size_bytes, created_at }
```

**Pruning:** Keep last 10 backups per sandbox

---

### 3.2 Vercel Sandbox Provider

**File:** `lib/services/vercel-sandbox-provider.ts`

#### Configuration
```typescript
// Environment variables
MILADY_AGENT_TEMPLATE_URL: Git repo (default: elizaos/milady-cloud-agent-template)
VERCEL_OIDC_TOKEN or (VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN)

// Sandbox settings
SANDBOX_VCPUS: 4
SANDBOX_HEALTH_PORT: 2138
SANDBOX_BRIDGE_PORT: 18790
SANDBOX_TIMEOUT_MS: 30 * 60 * 1000 (30 minutes)
```

#### Sandbox Creation
```typescript
await Sandbox.create({
  source: { type: "git", url: CLOUD_AGENT_TEMPLATE_URL },
  resources: { vcpus: 4 },
  timeout: 1800000,
  ports: [2138, 18790],
  runtime: "node24",
  env: {
    DATABASE_URL: "...",
    AGENT_NAME: "...",
    PORT: "2138",
    BRIDGE_PORT: "18790"
  }
});
```

**URLs:**
- Bridge: `https://{sandbox.domain(18790)}`
- Health: `https://{sandbox.domain(2138)}`

#### Lifecycle
- **Create:** Vercel Sandbox SDK allocates serverless container
- **Stop:** `sandbox.shutdown()` or `sandbox.close()`
- **Persistence:** Snapshots via Vercel SDK (vercel_snapshot_id)

---

### 3.3 Docker Sandbox Provider

**File:** `lib/services/docker-sandbox-provider.ts`

#### Configuration
```typescript
// Environment variables
MILADY_DOCKER_IMAGE: Docker image (default: milady/agent:cloud-full-ui)
MILADY_DOCKER_NODES: nodeId:hostname:capacity,... (e.g., "node1:10.0.0.5:8,node2:10.0.0.6:8")

// Port allocation
BRIDGE_PORT_MIN: 18790
BRIDGE_PORT_MAX: 19790
WEBUI_PORT_MIN: 20000
WEBUI_PORT_MAX: 25000
```

#### Sandbox Creation
```typescript
1. Parse nodes from MILADY_DOCKER_NODES
2. Select random node (TODO: least-loaded selection)
3. Allocate random ports for bridge + web UI
4. Generate container name: milady-{agentId.slice(0,8)}
5. SSH to node (via DockerSSHClient)
6. mkdir -p /data/agents/{agentId}
7. docker pull {MILADY_DOCKER_IMAGE}
8. docker run -d \
     --name milady-{agentId} \
     --restart unless-stopped \
     --cap-add=NET_ADMIN --device /dev/net/tun \
     -v /data/agents/{agentId}:/app/data \
     -p {bridgePort}:31337 \
     -p {webUiPort}:2138 \
     -e DATABASE_URL=... \
     -e AGENT_NAME=... \
     {DOCKER_IMAGE}
```

**URLs:**
- Bridge: `http://{hostname}:{bridgePort}`
- Health: `http://{hostname}:{webUiPort}`

#### Lifecycle
- **Create:** SSH → docker run
- **Stop:** SSH → docker stop -t 10 && docker rm -f
- **Persistence:** Volume at `/data/agents/{agentId}` (survives container restarts)

---

### 3.4 Provider Comparison

| Feature               | Vercel Sandbox                     | Docker Sandbox                      |
|-----------------------|-------------------------------------|-------------------------------------|
| **Infrastructure**    | Serverless (Vercel Edge)           | VPS nodes (self-hosted)             |
| **URL Scheme**        | `https://{domain}.vercel.app`      | `http://{vps_ip}:{port}`            |
| **Persistence**       | Snapshots (via SDK)                | Volume mounts (`/data/agents/...`)  |
| **Scaling**           | Auto-scale (Vercel handles)        | Manual node provisioning            |
| **Network**           | Public HTTPS                       | Headscale VPN (private IPs)         |
| **Cost**              | Per-minute usage (Vercel billing)  | Fixed VPS cost (per node)           |
| **Startup Time**      | ~10-20s (cold start)               | ~5-10s (image cached)               |
| **SDK Dependency**    | `@vercel/sandbox`                  | SSH + docker CLI                    |
| **Health Check Port** | 2138 (HTTPS)                       | 2138 (HTTP, mapped to host port)    |
| **Bridge Port**       | 18790 (HTTPS)                      | 31337 (HTTP, mapped to host port)   |

---

### 3.5 Database Provisioning (Neon)

**File:** `lib/services/neon-client.ts`

```typescript
// Every sandbox gets a dedicated Neon Postgres project
1. neon.createProject({
     name: `milady-{agentName}-{agentId.slice(0,8)}`,
     region: "aws-us-east-1"
   })
2. Returns: { projectId, branchId, connectionUri }
3. Stored in milady_sandboxes: neon_project_id, neon_branch_id, database_uri
4. Passed to sandbox as DATABASE_URL env var
```

**Cleanup:**
- On agent deletion: `neon.deleteProject(projectId)`
- Orphan prevention: If DB record fails to save after Neon creation, immediately deletes project

---

### 3.6 Integration Gaps

#### ❌ Missing: Cost Tracking
- No cost attribution for Vercel Sandbox usage
- No cost tracking for Docker node allocation
- Cannot bill users for sandbox runtime

**Recommendation:**
- Add `cost_per_hour` to milady_sandboxes table
- Track sandbox uptime in `sandbox_usage_records` table
- Deduct credits hourly via cron (similar to container-billing)

#### ❌ Missing: Node Selection Algorithm
- Docker provider uses random node selection
- Should use least-loaded (DockerNodeManager.getAvailableNode() exists but not used)

**Recommendation:**
- Update `docker-sandbox-provider.ts` to call `dockerNodeManager.getAvailableNode()`

#### ❌ Missing: Backup Restoration on Create
- Backups created but no way to restore to new sandbox on provision
- `snapshot_id` field exists but only used for Vercel snapshots

**Recommendation:**
- Add `restore_from_backup` option to createAgent()
- Load latest backup and push to new sandbox after provision

#### ✅ Working: Bridge Protocol
- JSON-RPC 2.0 over HTTP
- Consistent across both providers
- Supports streaming responses

---

## 4. API Surface

### 4.1 ElizaCloud API Endpoints

#### **Authentication** (All endpoints require auth unless noted)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/models` | GET | Session/Key | List AI models (OpenAI-compatible) |
| `/api/v1/models/status` | GET | Session/Key | Model availability status |

#### **Credits**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/credits/balance` | GET | Session/Key | Get credit balance |
| `/api/v1/credits/summary` | GET | Session/Key | Transaction summary |
| `/api/v1/credits/checkout` | POST | Session/Key | Create Stripe checkout (buy credits) |
| `/api/v1/credits/verify` | POST | Session/Key | Verify payment completion |

**Example: Get Balance**
```typescript
GET /api/v1/credits/balance
Headers:
  Authorization: Bearer {api_key}
  // or cookie: privy-token={session_token}

Response:
{ "balance": 25.50 }

Query params:
  ?fresh=true  // Bypass cache, fetch from DB
```

#### **Milady Agents**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/milady/agents` | GET | Org | List all agents |
| `/api/v1/milady/agents` | POST | Org | Create new agent |
| `/api/v1/milady/agents/{id}` | GET | Org | Get agent details |
| `/api/v1/milady/agents/{id}` | DELETE | Org | Delete agent |
| `/api/v1/milady/agents/{id}/provision` | POST | Org | Provision agent |
| `/api/v1/milady/agents/{id}/bridge` | POST | Org | Send JSON-RPC to agent |
| `/api/v1/milady/agents/{id}/stream` | POST | Org | Streaming bridge call |
| `/api/v1/milady/agents/{id}/snapshot` | POST | Org | Create backup |
| `/api/v1/milady/agents/{id}/restore` | POST | Org | Restore from backup |
| `/api/v1/milady/agents/{id}/backups` | GET | Org | List backups |

**Example: Create Agent**
```typescript
POST /api/v1/milady/agents
Headers:
  Authorization: Bearer {api_key}
Body:
{
  "agentName": "MyAgent",
  "agentConfig": { "model": "gpt-4" },
  "environmentVars": { "CUSTOM_VAR": "value" }
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "agentName": "MyAgent",
    "status": "pending",
    "createdAt": "2026-03-08T..."
  }
}
```

**Example: Bridge Call**
```typescript
POST /api/v1/milady/agents/{id}/bridge
Headers:
  Authorization: Bearer {api_key}
Body:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "chat.send",
  "params": { "message": "Hello" }
}

Response:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "reply": "Hello! How can I help?" }
}
```

#### **Containers**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/containers` | GET | Org | List containers |
| `/api/v1/containers` | POST | Org | Create container |
| `/api/v1/containers/{id}` | GET | Org | Get container |
| `/api/v1/containers/{id}` | DELETE | Org | Delete container |
| `/api/v1/containers/{id}/logs` | GET | Org | Get logs |

#### **Docker Nodes (Admin)**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/admin/docker-nodes` | GET | Admin | List nodes |
| `/api/v1/admin/docker-nodes/{id}` | GET | Admin | Get node |
| `/api/v1/admin/docker-nodes/{id}/health-check` | POST | Admin | Trigger health check |
| `/api/v1/admin/docker-containers` | GET | Admin | List all containers |
| `/api/v1/admin/docker-containers/{id}/logs` | GET | Admin | Get container logs |

---

### 4.2 milady-cloud API Endpoints

#### **Auth**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/signup` | POST | None | Create account |
| `/api/login` | POST | None | Login (returns JWT) |
| `/api/refresh` | POST | JWT | Refresh JWT token |
| `/api/me` | GET | JWT | Get current user |
| `/api/api-keys` | GET | JWT | List API keys |
| `/api/api-keys` | POST | JWT | Create API key |
| `/api/api-keys/{id}` | DELETE | JWT | Delete API key |

#### **Agents**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/availability` | GET | None | Get node capacity |
| `/api/agents` | POST | Auth | Create agent (async job) |
| `/api/agents` | GET | Auth | List user's agents |
| `/api/agents/{id}` | GET | Auth | Get agent details |
| `/api/agents/{id}` | DELETE | Auth | Delete agent |
| `/api/agents/{id}/credentials` | GET | Auth | Get agent credentials |
| `/api/agents/{id}/restart` | POST | Auth | Restart agent |
| `/api/agents/{id}/logs` | GET | Auth | Stream logs (SSE) |
| `/api/agents/{id}/headscale-ip` | GET | Auth | Get Headscale VPN IP |

**Job Status**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/jobs/{id}` | GET | Auth | Get job status |

#### **Billing**

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/billing/pricing` | GET | None | Get pricing tiers |
| `/api/billing/subscription` | GET | Auth | Get subscription |
| `/api/billing/create-checkout-session` | POST | Auth | Stripe checkout |
| `/api/billing/create-portal-session` | POST | Auth | Customer portal |
| `/api/billing/webhook` | POST | Stripe | Stripe webhook handler |
| `/api/billing/track-usage` | POST | Auth | Track usage metrics |
| `/api/billing/usage` | GET | Auth | Get usage stats |

---

### 4.3 Integration Needs

#### Required ElizaCloud Endpoints (Not Yet Implemented)

1. **Credit Reservation**
```typescript
POST /api/v1/credits/reserve
Body: { organizationId, amount, description, estimatedDuration }
Response: { reservationId, reservedAmount, expiresAt }
```

2. **Credit Reconciliation**
```typescript
POST /api/v1/credits/reconcile
Body: { reservationId, actualAmount }
Response: { success, refundedAmount?, chargedAmount? }
```

3. **Organization Lookup by API Key**
```typescript
GET /api/v1/auth/organization
Headers: Authorization: Bearer {api_key}
Response: { organizationId, userId, tier, balance }
```

4. **Webhook Subscription**
```typescript
POST /api/v1/webhooks
Body: { url, events: ["credits.low", "credits.depleted"] }
```

#### milady-cloud Changes Needed

1. **Add Balance Check Before Provisioning**
```typescript
// In POST /api/agents
const balance = await fetch(`${ELIZACLOUD_API_URL}/credits/balance`, {
  headers: { Authorization: `Bearer ${apiKey}` }
});
if (balance < MINIMUM_BALANCE) {
  return res.status(402).json({ error: "Insufficient credits" });
}
```

2. **Charge Credits for Sandbox Usage**
```typescript
// Daily cron job
for (const agent of runningAgents) {
  await fetch(`${ELIZACLOUD_API_URL}/credits/deduct`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agent.apiKey}` },
    body: JSON.stringify({
      amount: 0.10, // $0.10/day
      description: `Sandbox ${agent.id} daily charge`
    })
  });
}
```

3. **Add Organization ID Column**
```sql
ALTER TABLE agents ADD COLUMN organization_id UUID;
ALTER TABLE users ADD COLUMN organization_id UUID;
```

---

## 5. Data Model

### 5.1 Key Tables

#### **ElizaCloud: organizations**
```sql
id                              UUID PRIMARY KEY
name                            TEXT NOT NULL
slug                            TEXT UNIQUE NOT NULL
credit_balance                  NUMERIC(10,2) NOT NULL DEFAULT '100.00'
stripe_customer_id              TEXT
billing_email                   TEXT
auto_top_up_enabled             BOOLEAN DEFAULT FALSE
auto_top_up_amount              NUMERIC(10,2)
auto_top_up_threshold           NUMERIC(10,2) DEFAULT '0.00'
is_active                       BOOLEAN DEFAULT TRUE
created_at, updated_at          TIMESTAMP
```

#### **ElizaCloud: credit_transactions**
```sql
id                              UUID PRIMARY KEY
organization_id                 UUID NOT NULL REFERENCES organizations
user_id                         UUID REFERENCES users
amount                          NUMERIC(10,2) NOT NULL
type                            TEXT NOT NULL -- credit/debit/refund
description                     TEXT
metadata                        JSONB DEFAULT {}
stripe_payment_intent_id        TEXT UNIQUE
created_at                      TIMESTAMP
```

#### **ElizaCloud: milady_sandboxes**
```sql
id                              UUID PRIMARY KEY
organization_id                 UUID NOT NULL REFERENCES organizations
user_id                         UUID NOT NULL REFERENCES users
character_id                    UUID REFERENCES user_characters
sandbox_id                      TEXT -- Vercel/Docker sandbox ID
status                          TEXT NOT NULL -- pending/provisioning/running/stopped/error
bridge_url                      TEXT
health_url                      TEXT
agent_name                      TEXT
agent_config                    JSONB
neon_project_id                 TEXT
neon_branch_id                  TEXT
database_uri                    TEXT
database_status                 TEXT -- none/provisioning/ready/error
snapshot_id                     TEXT
last_backup_at                  TIMESTAMP
last_heartbeat_at               TIMESTAMP
error_message                   TEXT
error_count                     INT DEFAULT 0
environment_vars                JSONB DEFAULT {}
-- Docker-specific columns
node_id                         TEXT
container_name                  TEXT
bridge_port                     INT
web_ui_port                     INT
headscale_ip                    TEXT
docker_image                    TEXT
created_at, updated_at          TIMESTAMP
```

#### **ElizaCloud: docker_nodes**
```sql
id                              UUID PRIMARY KEY
node_id                         TEXT UNIQUE NOT NULL
hostname                        TEXT NOT NULL
ssh_port                        INT DEFAULT 22
capacity                        INT DEFAULT 8
enabled                         BOOLEAN DEFAULT TRUE
status                          TEXT NOT NULL -- healthy/degraded/offline/unknown
allocated_count                 INT DEFAULT 0
last_health_check               TIMESTAMP
ssh_user                        TEXT DEFAULT 'root'
metadata                        JSONB DEFAULT {}
created_at, updated_at          TIMESTAMP
```

#### **ElizaCloud: milady_sandbox_backups**
```sql
id                              UUID PRIMARY KEY
sandbox_record_id               UUID NOT NULL REFERENCES milady_sandboxes
snapshot_type                   TEXT NOT NULL -- auto/manual/pre-shutdown
state_data                      JSONB NOT NULL -- { memories, config, workspaceFiles }
vercel_snapshot_id              TEXT
size_bytes                      BIGINT
created_at                      TIMESTAMP
```

---

### 5.2 milady-cloud Tables

#### **users**
```sql
id                              UUID PRIMARY KEY
email                           TEXT UNIQUE NOT NULL
handle                          TEXT UNIQUE NOT NULL
password_hash                   TEXT NOT NULL
tier                            TEXT DEFAULT 'free' -- free/pro/team
name                            TEXT
created_at, updated_at          TIMESTAMP
```

#### **agents**
```sql
id                              UUID PRIMARY KEY
user_id                         UUID NOT NULL REFERENCES users
agent_name                      TEXT NOT NULL
status                          TEXT -- pending/provisioning/running/stopped/error
node_id                         TEXT
container_name                  TEXT
container_id                    TEXT
headscale_ip                    TEXT
error_message                   TEXT
created_at, updated_at          TIMESTAMP
```

#### **api_keys** (exists in both platforms)
```sql
-- milady-cloud
id                              UUID PRIMARY KEY
user_id                         UUID NOT NULL REFERENCES users
key_encrypted                   TEXT
key_hash                        TEXT
key_prefix                      TEXT (first 16 chars)
name                            TEXT
revoked_at                      TIMESTAMP
created_at                      TIMESTAMP

-- ElizaCloud (similar structure)
id                              UUID PRIMARY KEY
user_id                         UUID NOT NULL REFERENCES users
organization_id                 UUID NOT NULL REFERENCES organizations
key_encrypted                   TEXT NOT NULL
key_hash                        TEXT NOT NULL
key_prefix                      TEXT NOT NULL
name                            TEXT
is_active                       BOOLEAN DEFAULT TRUE
expires_at                      TIMESTAMP
last_used_at                    TIMESTAMP
usage_count                     INT DEFAULT 0
created_at, updated_at          TIMESTAMP
```

---

### 5.3 User Identity Mapping

```
ElizaCloud User                    milady-cloud User
─────────────────                  ──────────────────
users.id (UUID)  ────────────────▶ users.id (UUID)
users.privy_id   ╳                 (not stored)
organizations.id ╳                 (not stored)
                 │
                 └──▶ api_keys.key_hash (shared validation)
```

**Link:** API key serves as the identity bridge. When milady-cloud validates an ElizaCloud key, it looks up or creates a local user record.

---

### 5.4 Data Flow

#### User Registration
```
1. User signs up on ElizaCloud (Privy)
2. ElizaCloud creates:
   - users record (privy_id, email)
   - organizations record (default org)
   - api_keys record (auto-generated)
3. User gets API key (eliza_XXXX...)
4. User uses key in milady-cloud
5. milady-cloud validates key with ElizaCloud /models
6. milady-cloud creates local user record (email, handle)
```

#### Sandbox Creation (ElizaCloud → Neon)
```
1. User calls POST /api/v1/milady/agents
2. ElizaCloud creates milady_sandboxes record (status: pending)
3. On provision:
   a. Neon API → create project
   b. Update milady_sandboxes (neon_project_id, database_uri)
   c. SandboxProvider → create container/sandbox
   d. Update milady_sandboxes (sandbox_id, bridge_url, status: running)
```

#### Credit Deduction
```
1. User calls ElizaCloud API (e.g., /chat/completions)
2. ElizaCloud reserves credits (reserve-and-reconcile pattern)
3. Operation completes
4. Reconcile actual cost vs reserved
5. Insert credit_transactions record (type: debit)
6. Update organizations.credit_balance (atomic)
```

---

## 6. Infrastructure

### 6.1 Docker Node Management

**Primary Files:**
- `lib/services/docker-node-manager.ts`
- `lib/services/docker-ssh.ts`

#### Node Configuration
```typescript
// Stored in docker_nodes table
{
  node_id: "node1",
  hostname: "10.0.0.5",
  ssh_port: 22,
  capacity: 8,           // Max containers
  allocated_count: 3,    // Current containers
  status: "healthy",     // healthy/degraded/offline/unknown
  enabled: true
}
```

#### Node Selection
```typescript
// Find least-loaded node with available capacity
async getAvailableNode(): Promise<DockerNode | null> {
  // Queries: WHERE enabled=true AND status='healthy' AND allocated_count < capacity
  // ORDER BY allocated_count ASC LIMIT 1
}
```

#### Health Checks
```typescript
// Runs via cron /api/v1/cron/health-check
async healthCheckNode(node: DockerNode): Promise<DockerNodeStatus> {
  const ssh = DockerSSHClient.getClient(node.hostname);
  await ssh.connect();
  const dockerId = await ssh.exec("docker info --format '{{.ID}}'", 10000);
  return dockerId ? "healthy" : "degraded";
}
```

**Schedule:** Every 5 minutes

#### Capacity Sync
```typescript
// Reconcile allocated_count with actual container count
async syncAllocatedCounts(): Promise<Map<string, {before, after}>> {
  // Count containers in milady_sandboxes WHERE node_id=X AND status NOT IN (stopped, error)
  // Update docker_nodes.allocated_count
}
```

**Schedule:** Every 15 minutes (cron)

---

### 6.2 Docker SSH Client

**File:** `lib/services/docker-ssh.ts`

#### Connection Pooling
```typescript
// Singleton SSH client per hostname
private static clients = new Map<string, DockerSSHClient>();

static getClient(hostname: string): DockerSSHClient {
  if (!clients.has(hostname)) {
    clients.set(hostname, new DockerSSHClient(hostname));
  }
  return clients.get(hostname);
}
```

#### Command Execution
```typescript
async exec(command: string, timeoutMs: number): Promise<string> {
  // Uses node-ssh library
  // Throws on non-zero exit code or timeout
}

// Example usage
const ssh = DockerSSHClient.getClient("10.0.0.5");
await ssh.exec("docker pull milady/agent:cloud", 300000); // 5min timeout
await ssh.exec("docker run -d ...", 60000);
```

#### SSH Key Management
```typescript
// Expects SSH key at ~/.ssh/id_rsa or custom path via env
SSH_PRIVATE_KEY_PATH: /path/to/key
SSH_USER: root (default)
```

---

### 6.3 Headscale VPN

**Primary Files:**
- `lib/services/headscale-client.ts`
- `lib/services/headscale-integration.ts`

#### Purpose
- Provides private VPN network for Docker containers
- Containers join VPN on boot using pre-auth keys
- Enables secure communication between containers and ElizaCloud services

#### Architecture
```
Headscale Server (coordination)
  ↕ (REST API)
ElizaCloud (pre-auth key generation)
  ↕ (env vars)
Docker Containers (tailscale client)
  ↕ (Headscale VPN)
Private Network (100.64.0.0/10)
```

#### Pre-Auth Key Flow
```typescript
1. ElizaCloud generates pre-auth key:
   const key = await headscaleClient.createPreAuthKey({
     reusable: false,
     ephemeral: true,
     aclTags: ["tag:agent"],
     expiration: "24h"
   });

2. Key passed to Docker container via env var:
   HEADSCALE_AUTH_KEY={key.key}

3. Container runs on boot:
   tailscale up --authkey=$HEADSCALE_AUTH_KEY

4. Container joins VPN, gets IP (e.g., 100.64.0.42)

5. IP stored in milady_sandboxes.headscale_ip
```

#### Node Management
```typescript
// List all VPN nodes
const nodes = await headscaleClient.listNodes();

// Get node by hostname
const node = await headscaleClient.getNodeByName("milady-abc123");

// Get node IP
const ip = await headscaleClient.getNodeIP("milady-abc123");

// Delete node (cleanup)
await headscaleClient.deleteNode(nodeId);
```

#### Configuration
```bash
# Environment variables
HEADSCALE_API_URL=http://localhost:8081
HEADSCALE_API_KEY=secret_key
HEADSCALE_USER=milady  # VPN user namespace
```

#### ACL Tags
```typescript
// Tags control firewall rules (defined in Headscale ACL policy)
["tag:agent"]     // Standard agent access
["tag:admin"]     // Admin access
```

---

### 6.4 Container Networking

#### Vercel Sandbox
- **Network:** Public HTTPS endpoints
- **Bridge URL:** `https://{sandbox-id}.vercel.app:18790`
- **Health URL:** `https://{sandbox-id}.vercel.app:2138`
- **Security:** Vercel Edge Network (DDoS protection, CDN)

#### Docker Sandbox
- **Network:** Headscale VPN (private IPs)
- **Bridge URL:** `http://{node_hostname}:{bridge_port}` (e.g., `http://10.0.0.5:18790`)
- **Health URL:** `http://{node_hostname}:{web_ui_port}` (e.g., `http://10.0.0.5:20000`)
- **Container VPN IP:** `100.64.x.x` (Headscale-assigned)
- **Security:** VPN-only access (not exposed to public internet)

#### Port Mapping
```
Docker Container                          VPS Host
─────────────────                         ──────────
Bridge: 31337       ────────────────▶    {bridge_port} (18790-19790 range)
Health: 2138        ────────────────▶    {web_ui_port} (20000-25000 range)
```

---

### 6.5 Infrastructure Gaps

#### ❌ Missing: Load Balancer for Docker Nodes
- Direct access via `http://{node_ip}:{port}`
- No high availability if node goes down
- **Recommendation:** Add Nginx reverse proxy or Cloudflare Tunnel

#### ❌ Missing: Auto-Scaling for Docker Nodes
- Manual node provisioning via `MILADY_DOCKER_NODES` env var
- No dynamic scaling based on demand
- **Recommendation:** Implement node auto-scaling via Hetzner/DigitalOcean API

#### ❌ Missing: Container Restart Policies
- `--restart unless-stopped` set, but no monitoring for stuck containers
- **Recommendation:** Add health-check-based restart logic in cron

#### ❌ Missing: VPN IP Allocation Strategy
- Headscale assigns IPs automatically, no control
- Risk of IP exhaustion in large deployments
- **Recommendation:** Monitor IP pool usage, add alerting

#### ✅ Working: Node Health Monitoring
- Cron job checks Docker daemon every 5 minutes
- Marks nodes offline if health check fails
- Prevents provisioning to dead nodes

#### ✅ Working: SSH Connection Pooling
- Reuses SSH connections to reduce latency
- Handles reconnection on connection loss

---

## 7. Integration Gaps & Recommendations

### 7.1 Critical Gaps

#### 1. **No Credit Flow Between Platforms** 🔴
**Problem:**
- ElizaCloud manages credits, milady-cloud has no access
- milady-cloud can provision sandboxes without payment
- Risk of unpaid usage / revenue loss

**Impact:** HIGH (billing integrity)

**Recommendation:**
1. Implement `/api/v1/credits/reserve` and `/api/v1/credits/reconcile` endpoints in ElizaCloud
2. Update milady-cloud to check balance via `/api/v1/credits/balance` before provisioning
3. Add daily billing cron in milady-cloud to charge ElizaCloud for sandbox uptime
4. Add webhook from ElizaCloud → milady-cloud on low credits (pause sandboxes)

**Priority:** P0 (blocks monetization)

---

#### 2. **No Organization Concept in milady-cloud** 🔴
**Problem:**
- milady-cloud only tracks `user_id`, not `organization_id`
- Cannot enforce org-level quotas or billing
- User on ElizaCloud Team plan could exceed limits in milady-cloud

**Impact:** HIGH (quota enforcement)

**Recommendation:**
1. Add `organization_id` column to milady-cloud `users` and `agents` tables
2. Pass `organization_id` in ElizaCloud API key metadata
3. Add new endpoint: `GET /api/v1/auth/organization` (returns org info for API key)
4. Update milady-cloud provisioning to enforce org quotas

**Priority:** P0 (required for multi-tenant billing)

---

#### 3. **API Key Revocation Doesn't Propagate** 🟡
**Problem:**
- Revoking key in ElizaCloud doesn't invalidate it in milady-cloud
- User can continue using revoked key until milady-cloud validates again

**Impact:** MEDIUM (security)

**Recommendation:**
1. Implement webhook: ElizaCloud → milady-cloud on `api_key.revoked`
2. milady-cloud marks local key as revoked
3. Add periodic key validation refresh (every 5 minutes)

**Priority:** P1 (security hardening)

---

#### 4. **No Cost Attribution for Sandboxes** 🟡
**Problem:**
- Vercel Sandbox costs not tracked
- Docker node costs not allocated to users
- Cannot charge users for sandbox usage

**Impact:** MEDIUM (profitability)

**Recommendation:**
1. Add `cost_per_hour` to milady_sandboxes table
2. Track sandbox uptime in `sandbox_usage_records` table
3. Deduct credits hourly via cron (similar to container-billing)
4. Implement cost breakdown in `/api/v1/credits/summary`

**Priority:** P1 (required for profitability)

---

#### 5. **Backup Restoration Not Implemented** 🟡
**Problem:**
- Backups created but cannot restore to new sandbox
- `snapshot_id` field exists but only works for Vercel snapshots

**Impact:** LOW (feature completeness)

**Recommendation:**
1. Add `restore_from_backup` option to `createAgent()`
2. Load latest backup and push to new sandbox after provision
3. Add endpoint: `POST /api/v1/milady/agents/{id}/restore?backupId={id}`

**Priority:** P2 (user experience)

---

### 7.2 Security Risks

#### 1. **API Key Logging** 🔴
**Risk:** milady-cloud request logs may expose API keys
**Mitigation:**
- Sanitize Authorization headers in logs
- Use key prefix (first 8 chars) for debugging

#### 2. **No Rate Limiting Across Platforms** 🟡
**Risk:** User could exceed rate limits on one platform but not the other
**Mitigation:**
- Share Redis for rate-limiting
- Implement distributed rate limiter (Redis-based)

#### 3. **SSH Key Management** 🟡
**Risk:** SSH keys stored in environment variables (Vercel)
**Mitigation:**
- Use secret management service (AWS Secrets Manager, Doppler)
- Rotate keys regularly

#### 4. **Database Credentials in Logs** 🟡
**Risk:** Neon connection strings logged during errors
**Mitigation:**
- Sanitize DATABASE_URL in error logs
- Use credential masking (e.g., `postgres://user:***@host/db`)

---

### 7.3 Reliability Gaps

#### 1. **No Container Restart on Health Check Failure**
**Current:** Health checks run but don't trigger restarts
**Recommendation:** Add auto-restart logic in `/api/v1/cron/health-check`

#### 2. **No Orphan Container Cleanup**
**Current:** Containers may exist without DB records
**Recommendation:** Add audit cron to find orphans and clean up

#### 3. **No Database Backup Strategy**
**Current:** Neon projects created but no backups
**Recommendation:** Enable Neon auto-backups, add point-in-time recovery

#### 4. **No Load Balancer for Docker Nodes**
**Current:** Single point of failure per node
**Recommendation:** Add Nginx or Cloudflare Tunnel for HA

---

### 7.4 Priority Matrix

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Credit flow integration | HIGH | HIGH | P0 |
| Organization ID in milady-cloud | HIGH | MEDIUM | P0 |
| API key revocation webhook | MEDIUM | LOW | P1 |
| Sandbox cost tracking | MEDIUM | MEDIUM | P1 |
| Rate limiting sync | MEDIUM | LOW | P1 |
| Backup restoration | LOW | MEDIUM | P2 |
| Container auto-restart | MEDIUM | LOW | P2 |
| Orphan cleanup | LOW | LOW | P2 |

---

### 7.5 Recommended Integration Sequence

#### Phase 1: Foundation (P0 - Week 1-2)
1. Implement `/api/v1/credits/reserve` and `/api/v1/credits/reconcile` in ElizaCloud
2. Add `organization_id` to milady-cloud schema
3. Implement `GET /api/v1/auth/organization` endpoint
4. Update milady-cloud to check balance before provisioning

#### Phase 2: Security (P1 - Week 3)
1. Implement key revocation webhook
2. Add shared rate-limiting (Redis)
3. Sanitize logs (API keys, DB credentials)

#### Phase 3: Billing (P1 - Week 4)
1. Add sandbox cost tracking
2. Implement hourly billing cron
3. Add cost breakdown to credits API

#### Phase 4: Reliability (P2 - Week 5-6)
1. Container auto-restart on health failure
2. Orphan cleanup cron
3. Backup restoration endpoints
4. Load balancer for Docker nodes

---

## Appendix

### Environment Variables

#### ElizaCloud
```bash
# Auth
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# Database
DATABASE_URL=postgresql://...

# Neon
NEON_API_KEY=...

# Headscale VPN
HEADSCALE_API_URL=http://localhost:8081
HEADSCALE_API_KEY=...
HEADSCALE_USER=milady

# Docker Nodes
MILADY_DOCKER_NODES=node1:10.0.0.5:8,node2:10.0.0.6:8
MILADY_DOCKER_IMAGE=milady/agent:cloud-full-ui

# Vercel Sandbox
VERCEL_OIDC_TOKEN=... (or VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN)
MILADY_AGENT_TEMPLATE_URL=https://github.com/elizaos/milady-cloud-agent-template.git
```

#### milady-cloud
```bash
# Auth
JWT_SECRET=...
ELIZACLOUD_API_URL=https://www.elizacloud.ai/api/v1

# Database
DATABASE_URL=postgresql://...

# Stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID_PRO=...
STRIPE_PRICE_ID_TEAM=...
```

---

### Related Files

**ElizaCloud:**
- Auth: `lib/auth.ts`, `lib/auth/privy-client.ts`
- Credits: `lib/services/credits.ts`, `lib/pricing-constants.ts`
- Sandboxes: `lib/services/milady-sandbox.ts`, `lib/services/vercel-sandbox-provider.ts`, `lib/services/docker-sandbox-provider.ts`
- Infrastructure: `lib/services/docker-node-manager.ts`, `lib/services/docker-ssh.ts`, `lib/services/headscale-client.ts`
- API: `app/api/v1/milady/`, `app/api/v1/credits/`, `app/api/v1/models/`

**milady-cloud:**
- Auth: `middleware/auth.ts`, `routes/auth.ts`
- Agents: `routes/agents.ts`
- Billing: `routes/billing.ts`

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-08  
**Maintainer:** Team Lead

