# Thin-Client Compatibility Contract

> **Branch**: `feat/compat-surface-v2`
> **Date**: 2026-03-09
> **Purpose**: Allow waifu-core / milady-cloud to behave as thin clients against eliza-cloud-v2.

## Architecture

```
┌──────────────┐  X-Service-Key   ┌─────────────────────┐
│ milady-cloud │ ───────────────→ │   eliza-cloud-v2    │
│ (frontend)   │                  │                     │
│              │                  │ Compat Routes:      │
│              │                  │  /api/compat/*      │
└──────────────┘                  │                     │
                                  │ S2S Routes:         │
┌──────────────┐  HS256 JWT       │  /api/v1/agents/*   │
│  waifu-core  │ ───────────────→ │                     │
│  (Hono API)  │  MiladyClient   │ Native Routes:      │
│              │                  │  /api/v1/milaidy/*  │
└──────────────┘                  └─────────────────────┘
```

## Three API Layers

### 1. `/api/compat/*` — Universal Compat Routes (NEW)

Tri-auth: X-Service-Key → HS256 JWT → Privy/API-key.
Envelope: `{ success: boolean, data?: T, error?: string }`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/compat/agents` | GET | Any | List agents |
| `/api/compat/agents` | POST | Any | Create agent |
| `/api/compat/agents/:id` | GET | Any | Agent detail |
| `/api/compat/agents/:id` | DELETE | Any | Delete agent |
| `/api/compat/agents/:id/status` | GET | Any | Agent status |
| `/api/compat/agents/:id/logs` | GET | Any | Agent logs |
| `/api/compat/agents/:id/restart` | POST | Any | Restart |
| `/api/compat/agents/:id/suspend` | POST | Any | Suspend |
| `/api/compat/agents/:id/resume` | POST | Any | Resume |
| `/api/compat/availability` | GET | None | Capacity check |
| `/api/compat/jobs/:jobId` | GET | Any | Synthesized job status |

### 2. `/api/v1/agents/*` — S2S Routes (UPDATED)

X-Service-Key only. Now uses canonical `CompatStatusShape` / `CompatUsageShape`.
Added: `/api/v1/agents/:id/logs` (was missing).

### 3. `/api/v1/milaidy/*` — Native Routes (UNCHANGED)

Dashboard Privy/API-key auth. Full agent lifecycle.

## Status Mapping

| Internal | Compat |
|----------|--------|
| pending | queued |
| provisioning | provisioning |
| running | running |
| stopped | stopped |
| disconnected | stopped |
| error | failed |

## Auth Config

| Variable | Where | Purpose |
|----------|-------|---------|
| `WAIFU_SERVICE_KEY` | eliza-cloud | X-Service-Key shared secret |
| `WAIFU_SERVICE_ORG_ID` | eliza-cloud | Org for service-key agents |
| `WAIFU_SERVICE_USER_ID` | eliza-cloud | User for service-key agents |
| `MILADY_SERVICE_JWT_SECRET` | eliza-cloud | HS256 JWT shared secret |
| `WAIFU_BRIDGE_ORG_ID` | eliza-cloud | Pin JWT users to org |
| `WAIFU_AUTO_PROVISION` | eliza-cloud | Auto-provision on create |

## Intentionally Excluded

1. **Per-agent billing** — Product-specific billing logic differs across deployments
2. **Character management** — Dashboard UX territory
3. **Social platform connections** — Per-deployment product feature
4. **Knowledge base** — RAG pipeline = dashboard UX
5. **A2A protocol** — Product-specific orchestration
6. **MCP tools** — Product-specific plugin system

## File Inventory

| File | Purpose |
|------|---------|
| `lib/api/compat-envelope.ts` | Canonical response shapes + translators |
| `lib/auth/service-jwt.ts` | HS256 JWT verification |
| `lib/auth/waifu-bridge.ts` | Service JWT → user+org resolution |
| `app/api/compat/_lib/auth.ts` | Tri-auth helper |
| `app/api/compat/agents/route.ts` | List/create agents |
| `app/api/compat/agents/[id]/route.ts` | Get/delete agent |
| `app/api/compat/agents/[id]/status/route.ts` | Agent status |
| `app/api/compat/agents/[id]/logs/route.ts` | Agent logs |
| `app/api/compat/agents/[id]/restart/route.ts` | Restart |
| `app/api/compat/agents/[id]/suspend/route.ts` | Suspend |
| `app/api/compat/agents/[id]/resume/route.ts` | Resume |
| `app/api/compat/availability/route.ts` | Capacity check |
| `app/api/compat/jobs/[jobId]/route.ts` | Synthesized job status |
| `app/api/v1/agents/[agentId]/logs/route.ts` | S2S logs (NEW) |
| `tests/unit/compat-envelope.test.ts` | 30+ field translation tests |
| `tests/unit/service-jwt.test.ts` | JWT verification tests |
