# MCP Architecture Spec v2 — Final Implementation Blueprint

> Date: 2026-02-11
> Status: Approved
> Authors: Architecture review (8-agent investigation + Architect synthesis)

---

## Executive Summary

Eliza Cloud V2 has strong MCP foundations: OAuth across 12 providers, encrypted token storage, multi-step execution (6 iterations), Redis caching, per-provider MCP endpoints, and a user MCP marketplace. The scaling bottleneck is **tool selection quality** — all validated tools get dumped into the LLM prompt, degrading accuracy beyond ~30-50 tools. Secondary issues: stale OAuth state across Vercel instances (warm up to 14 days), SSE transport deprecated on Vercel, and no tool discovery mechanism.

**Solution:** Two-tier action visibility (crucial always visible, rest discoverable via BM25 search) + transport hardening (streamable-http only) + OAuth version-counter cache invalidation. No external dependencies (no Composio). Uses existing BM25 from `@elizaos/core`.

---

## Table of Contents

1. [All Decisions (Final)](#1-all-decisions-final)
2. [Architecture Overview](#2-architecture-overview)
3. [Two-Tier Action Visibility](#3-two-tier-action-visibility)
4. [Meta-Actions](#4-meta-actions)
5. [BM25 Indexing Strategy](#5-bm25-indexing-strategy)
6. [Singleton + Per-Request Auth Pattern](#6-singleton--per-request-auth-pattern)
7. [OAuth Version-Counter Invalidation](#7-oauth-version-counter-invalidation)
8. [Transport Policy](#8-transport-policy)
9. [Vercel Serverless Constraints](#9-vercel-serverless-constraints)
10. [Multi-Step Loop Integration](#10-multi-step-loop-integration)
11. [File-Level Implementation Plan](#11-file-level-implementation-plan)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. All Decisions (Final)

| Decision | Choice | Effort |
|---|---|---|
| External integration | **No Composio. All internal. We are the platform.** | — |
| Tool discovery engine | **BM25 from `@elizaos/core`**, no embeddings/vector DB | Short |
| Production transport | **`streamable-http` only** | Short |
| Dev transport | `stdio` + `streamable-http` | Quick |
| Action visibility | **Tier 1 always in prompt, Tier 2 via SEARCH_ACTIONS** | Medium |
| Meta-actions | **2 only:** `SEARCH_ACTIONS`, `LIST_CONNECTIONS` | Medium |
| Discovered tool execution | **Dynamic registration as real actions** — no wrapper meta-action | — |
| Handler singletons | Keep for stateless schemas/clients. **Never cache auth/tokens.** | Quick |
| OAuth invalidation | Redis version counters per `(orgId, platform)` + versioned keys + hard TTL (no SWR) | Medium |
| RuntimeCache OOM | **Deferred** — focus on MCP first | — |
| SSE transport | **Removed from production** | Short |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Request                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  API Route → Auth → AsyncLocalStorage.run(authResult)       │
│  RuntimeFactory.createRuntimeForUser(context)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CloudBootstrapMessageService (Multi-Step Loop, 6 iter)     │
│                                                             │
│  ACTIONS Provider sees:                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tier 1: Platform tools + Crucial OAuth actions      │    │
│  │ Meta:   SEARCH_ACTIONS + LIST_CONNECTIONS           │    │
│  │ Dynamic: Actions registered by previous SEARCH call │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
     ┌──────────┐  ┌─────────────┐  ┌────────────────┐
     │ Tier 1   │  │ SEARCH_     │  │ Dynamically    │
     │ Direct   │  │ ACTIONS     │  │ Registered     │
     │ Execute  │  │ (BM25)      │  │ Tier-2 Tools   │
     └────┬─────┘  └──────┬──────┘  └───────┬────────┘
          │               │                  │
          │               │ registers tools  │
          │               │ on runtime       │
          ▼               ▼                  ▼
     ┌─────────────────────────────────────────────┐
     │  McpService.callTool(server, tool, params)  │
     │  → Per-request token fetch (OAuth service)  │
     │  → streamable-http transport                │
     └──────────────────────────┬──────────────────┘
                                │
                                ▼
     ┌─────────────────────────────────────────────┐
     │  /api/mcps/{provider}/streamable-http       │
     │  → getAuthContext() → oauthService           │
     │  → Versioned token cache (Redis)            │
     │  → Provider API call                        │
     └─────────────────────────────────────────────┘
```

---

## 3. Two-Tier Action Visibility

### Tier 1 — Crucial (Always in LLM prompt)

**All platform tools** remain visible as-is:
- credits, conversations, generation, memory, agents, containers, rooms, user, knowledge, redemption, analytics, api-keys, mcps

**Per connected OAuth provider** — 3-5 high-value actions:

| Provider | Crucial Actions |
|----------|----------------|
| **google** | `google_status`, `gmail_list`, `gmail_send`, `calendar_list_events`, `calendar_create_event` |
| **linear** | `linear_status`, `linear_list_issues`, `linear_create_issue`, `linear_update_issue`, `linear_list_projects` |
| **github** | `github_status`, `github_list_repos`, `github_list_prs`, `github_create_issue`, `github_create_pr` |
| **notion** | `notion_status`, `notion_search`, `notion_get_page`, `notion_create_page`, `notion_query_data_source` |
| **asana** | `asana_status`, `asana_list_projects`, `asana_list_tasks`, `asana_create_task`, `asana_update_task` |
| **dropbox** | `dropbox_status`, `dropbox_list_folder`, `dropbox_search`, `dropbox_upload_text`, `dropbox_create_shared_link` |
| **salesforce** | `salesforce_status`, `salesforce_query`, `salesforce_search`, `salesforce_get_record`, `salesforce_update_record` |
| **airtable** | `airtable_status`, `airtable_list_bases`, `airtable_list_records`, `airtable_search_records`, `airtable_create_records` |
| **zoom** | `zoom_status`, `zoom_list_meetings`, `zoom_get_meeting`, `zoom_create_meeting`, `zoom_update_meeting` |
| **jira** | `jira_status`, `jira_search_issues`, `jira_get_issue`, `jira_create_issue`, `jira_update_issue` |
| **linkedin** | `linkedin_status`, `linkedin_get_profile`, `linkedin_create_post`, `linkedin_delete_post` |
| **microsoft** | `microsoft_status`, `outlook_list`, `outlook_send`, `calendar_list_events`, `calendar_create_event` |

**Worst case with all 12 providers connected:** ~25 platform tools + ~55 crucial OAuth tools + 2 meta-actions = **~82 actions** (manageable for modern LLMs).

### Tier 2 — Discoverable (via SEARCH_ACTIONS only)

Every other MCP tool not listed above. Not registered as direct ElizaOS actions at boot. Indexed in BM25. When found via `SEARCH_ACTIONS`, dynamically registered as real actions on the runtime for subsequent iterations.

### Configuration

Tier-1 maps defined as static config per provider:

```typescript
// tool-visibility.ts
const CRUCIAL_TOOLS: Record<string, string[]> = {
  google: ["google_status", "gmail_list", "gmail_send", "calendar_list_events", "calendar_create_event"],
  linear: ["linear_status", "linear_list_issues", "linear_create_issue", "linear_update_issue", "linear_list_projects"],
  github: ["github_status", "github_list_repos", "github_list_prs", "github_create_issue", "github_create_pr"],
  // ... etc for all 12 providers
};

function isCrucialTool(serverName: string, toolName: string): boolean {
  const actionName = toActionName(serverName, toolName);
  const crucialList = CRUCIAL_TOOLS[serverName.toLowerCase()];
  return crucialList?.includes(actionName.toLowerCase()) ?? false;
}
```

---

## 4. Meta-Actions

### `SEARCH_ACTIONS`

**Description:** A transparent meta-action that discovers Tier-2 tools and registers them on the runtime. Unlike normal actions, SEARCH_ACTIONS does not produce visible output in `# Previous Action Results`. Its sole effect is that found tools appear in `# Available Actions (with parameter schemas)` on the next multi-step iteration. The LLM never sees SEARCH_ACTIONS as a "result" — it simply sees new tools become available.

#### 4.1 Input Schema

```typescript
interface SearchActionsInput {
  /**
   * Search keywords matched against tool names, descriptions, and provider tags.
   * Uses BM25 keyword matching — specific nouns and verbs work best.
   * Good: "list commits", "send email", "create calendar event"
   * Bad: "stuff", "do things", "help me"
   */
  query: string;          // Required

  /**
   * Filter results to a single OAuth provider.
   * Enum: "google" | "linear" | "github" | "notion" | "asana" | "dropbox"
   *      | "salesforce" | "airtable" | "zoom" | "jira" | "linkedin" | "microsoft"
   */
  platform?: string;      // Optional

  /**
   * Maximum number of results to return.
   * Clamped to [1, 20].
   */
  limit?: number;         // Optional, default: 10, max: 20

  /**
   * Skip first N results. Use with limit for pagination through large catalogs.
   * Example: limit=10, offset=10 returns results 11-20.
   */
  offset?: number;        // Optional, default: 0
}
```

#### 4.2 Handler Behavior

1. Extract `query`, `platform`, `limit`, `offset` from action parameters.
2. Validate `query` is non-empty. Return error if missing (errors ARE visible — see 4.3).
3. BM25 search the Tier-2 catalog. Pre-filter by user's connected OAuth platforms. Apply `platform` filter if provided.
4. Apply `offset` (skip first N results), then take up to `limit` results.
5. For each result, check if already registered on `runtime.actions` (by action name).
6. If not registered: call `createMcpToolAction(serverName, tool, existingNames)` → `runtime.registerAction(action)`.
7. Return `ActionResult` with `success: true` and metadata (see 4.5 for data shape). **Do not** call `callback()` — the text output is intentionally suppressed.

#### 4.3 Transparency Rule

SEARCH_ACTIONS is a **transparent** action. Its execution trace is handled differently from all other actions:

| Aspect | Normal Actions | SEARCH_ACTIONS |
|--------|---------------|----------------|
| Recorded in `traceActionResult[]` | Yes | **No** (suppressed) |
| Visible in `# Previous Action Results` | Yes | **No** |
| Tools registered on `runtime.actions` | N/A | **Yes** — the only side effect |
| Tools visible in `# Available Actions` next iteration | N/A | **Yes** |
| Error on failure | Shown in results | **Yes** — errors ARE recorded in `traceActionResult[]` |

**Implementation:** The multi-step loop in `CloudBootstrapMessageService` checks `actionName === "SEARCH_ACTIONS"` after execution. On success, the result is **not** pushed to `traceActionResult[]`. On failure (`success: false`), the error IS pushed so the LLM can recover.

**Why transparent?** If SEARCH_ACTIONS output appeared in `# Previous Action Results`, the LLM would see a wall of tool descriptions as "results" and might try to summarize them instead of using them. By suppressing the output and letting tools appear naturally in `# Available Actions`, the LLM treats discovered tools identically to Tier-1 tools — no special handling needed.

#### 4.4 Return Value Shape

```typescript
// On success:
{
  success: true,
  data: {
    query: string,
    platform: string | undefined,
    offset: number,
    limit: number,
    resultCount: number,          // total results returned
    totalAvailable: number,       // total matches before offset/limit (for pagination)
    newlyRegistered: string[],    // action names registered this call
    alreadyRegistered: string[],  // action names that were already on runtime
  }
}

// On error (e.g., empty query):
{
  success: false,
  error: "A search query is required"
}
```

Note: Even though `success: true` results are not shown to the LLM, the return value is used internally for logging, analytics, and debugging.

#### 4.5 Examples

**Example 1: Search → Discover → Use**

```
Iteration 1:
  # Available Actions (with parameter schemas)
  ... Tier-1 tools (github_list_repos, github_list_prs, ...) ...
  SEARCH_ACTIONS, LIST_CONNECTIONS

  LLM decides: "I need to list commits but don't see that action. Search for it."
  LLM calls: SEARCH_ACTIONS({ query: "list commits repository", platform: "github" })

  Handler:
    → BM25 finds: GITHUB_LIST_COMMITS (score 8.2), GITHUB_GET_COMMIT (5.1), GITHUB_COMPARE_COMMITS (3.7)
    → Registers all 3 on runtime.actions
    → Returns { success: true, data: { newlyRegistered: ["GITHUB_LIST_COMMITS", ...], ... } }
    → Result is NOT pushed to traceActionResult[]

  # Previous Action Results
  (empty — SEARCH_ACTIONS was transparent)

Iteration 2:
  refreshStateAfterAction() → recomposes state
  ACTIONS provider validates runtime.actions (now includes discovered tools)

  # Available Actions (with parameter schemas)
  ... Tier-1 tools ...
  SEARCH_ACTIONS, LIST_CONNECTIONS
  GITHUB_LIST_COMMITS({ owner: string, repo: string, sha?: string, per_page?: number })
  GITHUB_GET_COMMIT({ owner: string, repo: string, ref: string })
  GITHUB_COMPARE_COMMITS({ owner: string, repo: string, base: string, head: string })

  LLM sees GITHUB_LIST_COMMITS as a normal available action.
  LLM calls: GITHUB_LIST_COMMITS({ owner: "elizaOS", repo: "eliza", per_page: 10 })
  → Normal execution via McpService.callTool()

Iteration 3:
  # Previous Action Results
  1. GITHUB_LIST_COMMITS - Success
     Output: [10 commits with SHAs, messages, authors...]

  LLM synthesizes response. Sets isFinish=true.
```

**Example 2: No Results**

```
Iteration 1:
  LLM calls: SEARCH_ACTIONS({ query: "deploy kubernetes pod" })

  Handler:
    → BM25 returns 0 results (no k8s tools in catalog)
    → Nothing registered
    → Returns { success: true, data: { resultCount: 0, newlyRegistered: [] } }
    → Result is NOT pushed to traceActionResult[]

Iteration 2:
  # Available Actions — unchanged (no new tools appeared)
  # Previous Action Results — empty

  LLM sees no new tools. Proceeds without them or tries a different query.
```

**Example 3: Pagination**

```
Iteration 1:
  LLM calls: SEARCH_ACTIONS({ query: "google", limit: 5 })
  → Returns 5 results, totalAvailable: 18
  → 5 tools registered

Iteration 2:
  LLM sees 5 new Google tools but needs more.
  LLM calls: SEARCH_ACTIONS({ query: "google", limit: 5, offset: 5 })
  → Returns next 5 results
  → 5 more tools registered

Iteration 3:
  LLM now has 10 Google tools available. Proceeds with the one it needs.
```

**Example 4: Error (Visible)**

```
Iteration 1:
  LLM calls: SEARCH_ACTIONS({ query: "" })

  Handler:
    → Returns { success: false, error: "A search query is required" }
    → Error IS pushed to traceActionResult[]

Iteration 2:
  # Previous Action Results
  1. SEARCH_ACTIONS - Failed
     Error: A search query is required

  LLM sees the error and retries with a proper query.
```

#### 4.6 Edge Cases

| Case | Behavior |
|------|----------|
| Empty query (`""` or whitespace) | Return `{ success: false, error: "A search query is required" }`. Error visible in trace. |
| All results already registered | No-op for registration. Return `success: true` with `newlyRegistered: []`, `alreadyRegistered: [...]`. Still transparent. |
| `platform` not in user's connected providers | BM25 search runs but returns 0 results (catalog only contains tools for connected platforms). |
| `platform` is invalid string | Treated as filter — no matches, 0 results. No error. |
| `offset` >= total results | Returns 0 results. No error. |
| `limit` > 20 | Clamped to 20. |
| `limit` < 1 | Clamped to 1. |
| MCP service unavailable | Return `{ success: false, error: "MCP service not available" }`. Error visible in trace. |
| BM25 index empty (no Tier-2 tools) | Returns 0 results. Possible when no OAuth providers are connected or all tools are Tier-1. |
| Concurrent SEARCH_ACTIONS calls | Safe. Registration uses TOCTOU mitigation: re-check `runtime.actions` before each `registerAction()`. Duplicate names are skipped. |
| Action naming collision with existing action | `createMcpToolAction()` appends `_2`, `_3` suffixes. Existing mechanism. |

### `LIST_CONNECTIONS`

**Description:** Check which platforms are connected and their OAuth status.

**Input Schema:**
```typescript
{
  platform?: string;  // Optional. Filter to specific provider.
}
```

**Handler behavior:**
1. Get org ID from auth context
2. Call `oauthService.listConnections({ organizationId, platform })`
3. Return formatted connection status

**Output:**
```
Connected platforms (4):
- Google: connected as ben@example.com (gmail, calendar scopes)
- Linear: connected as ben (read, write scopes)
- GitHub: connected as 0xbbjoker (repo, issues scopes)
- Notion: connected as Ben's Workspace (read, write scopes)

Not connected: Asana, Dropbox, Salesforce, Airtable, Zoom, Jira, LinkedIn, Microsoft
```

---

## 5. BM25 Indexing Strategy

### Index Construction

Built once per runtime initialization from Tier-2 tools:

```typescript
// bm25-index.ts
import { BM25 } from "@elizaos/core";

class Tier2ToolIndex {
  private bm25: BM25;
  private tools: Tier2ToolEntry[];

  build(tier2Tools: Tier2ToolEntry[]) {
    this.tools = tier2Tools;
    const docs = tier2Tools.map(t => ({
      name: t.actionName,                    // e.g. "GITHUB_LIST_COMMITS"
      description: t.tool.description || "",
      tags: [t.serverName, t.platform, ...tokenizeToolName(t.tool.name)].join(" "),
    }));
    this.bm25 = new BM25(docs, {
      k1: 1.2,
      b: 0.75,
      fieldBoosts: { name: 3.0, description: 1.5, tags: 1.0 },
      stemming: false,
    });
  }

  search(query: string, platform?: string, limit = 10, offset = 0): Tier2ToolEntry[] {
    const results = this.bm25.search(query, (offset + limit) * 2); // overfetch for filtering
    let entries = results.map(r => this.tools[r.index]);
    if (platform) {
      entries = entries.filter(e => e.platform === platform);
    }
    return entries.slice(offset, offset + limit);
  }
}
```

### Document Shape

```typescript
interface Tier2ToolEntry {
  serverName: string;      // e.g. "github"
  toolName: string;        // e.g. "list_commits"
  actionName: string;      // e.g. "GITHUB_LIST_COMMITS"
  platform: string;        // e.g. "github"
  tool: McpTool;           // Original MCP tool object (name, description, inputSchema)
}
```

### Rebuild Triggers

- Runtime initialized (cold start or cache miss)
- MCP schemas refresh/reconnect
- Runtime recreated due to MCP version bump (OAuth change)

### Tags Composition

For tool `github/list_commits`:
- Server name: `"github"`
- Platform: `"github"`
- Tokenized tool name: `"list"`, `"commits"`
- Combined: `"github github list commits"`

This ensures BM25 matches on provider name, action verbs, and domain nouns.

---

## 6. Singleton + Per-Request Auth Pattern

### The Rule

| Singleton MAY cache | Singleton MUST NOT cache |
|---|---|
| Static tool schemas | OAuth tokens |
| Server configs | Org/user auth state |
| HTTP client instances | Per-request credentials |
| BM25 index | Connection status |
| Transport factories | Entity settings |

### Pattern

```
Module level (persists up to 14 days on Vercel Pro):
  let mcpHandler = null;  // OK — stateless with respect to auth

Per request (via AsyncLocalStorage):
  authContextStorage.run(authResult, async () => {
    // Everything inside here has access to auth context
    const handler = await getMcpHandler();  // reuse singleton
    return handler(req);  // handler internally calls getAuthContext() per tool
  });

Per tool execution:
  // Inside each MCP tool handler:
  const { user } = getAuthContext();  // from AsyncLocalStorage — per-request
  const token = await oauthService.getValidTokenByPlatform({
    organizationId: user.organization_id,
    platform: "linear"
  });
  // Token fetched from Redis (versioned cache) or DB — never from singleton
```

### AsyncLocalStorage Safety

- **Reliable** within a single route handler's `.run()` scope
- **Broken by design** across middleware → handler boundaries (confirmed by Vercel/Next.js)
- All MCP routes already use `.run()` correctly within the handler — no changes needed
- Never rely on ALS in `setTimeout`, `setInterval`, or detached promises

---

## 7. OAuth Version-Counter Invalidation

### Problem

Entity settings cached with 5-min TTL + SWR = up to 10 minutes of stale OAuth state. Vercel warm instances persist up to 14 days. No cross-instance in-memory invalidation exists.

### Solution: Versioned Cache Keys

Old keys auto-miss when version increments. No need for cross-instance invalidation.

### Redis Key Patterns

```
# Version counter (atomic integer, TTL 30 days refreshed on write)
oauth:version:{orgId}:{platform}
  → integer (e.g., 7)

# Token cache (hard TTL, NO SWR)
oauth_token:v{version}:{orgId}:{connectionId}
  → encrypted token string
  → TTL: min(token_expiry - 5min, 24h), default 1h
```

### Write Flow (OAuth State Changes)

```
On OAuth connect callback:
  1. Store credentials in DB (source of truth)
  2. INCR oauth:version:{orgId}:{platform}
  3. Invalidate runtime cache (existing: invalidateByOrganization)
  4. Invalidate entity settings cache (existing: entitySettingsCache.invalidateUser)
  5. Bump MCP version (existing: edgeRuntimeCache.bumpMcpVersion)

On OAuth disconnect/revoke:
  1. Update DB credential status
  2. INCR oauth:version:{orgId}:{platform}
  3. Same invalidation chain as connect

On token refresh:
  1. Rotate tokens in DB
  2. INCR oauth:version:{orgId}:{platform}
  3. Write new token to versioned cache key
```

### Read Flow (Token Retrieval)

```
oauthService.getValidTokenByPlatform(orgId, platform):
  1. GET oauth:version:{orgId}:{platform} → version (e.g., 7)
  2. GET oauth_token:v7:{orgId}:{connectionId}
     → HIT: return cached token (valid, correct version)
     → MISS: fetch from DB, decrypt, write to v7 key with hard TTL
  3. Return token
```

### Why This Works

- When OAuth changes, version increments from 7 → 8
- All existing cache keys are `v7:...` — they naturally miss
- New requests read version 8, write `v8:...` keys
- Old `v7:...` keys expire via hard TTL — no cleanup needed
- Works across all Vercel instances without cross-instance communication
- Each instance independently reads the current version from Redis

### TTL Policy

| Data | TTL | SWR |
|---|---|---|
| Version counter | 30 days (refreshed on write) | No |
| Token cache | `min(token_expiry - 5min, 24h)`, default 1h | **No** |
| Entity settings | 5min (existing, keep for non-auth data) | Yes (existing) |

---

## 8. Transport Policy

### Enforcement Matrix

| Environment | `streamable-http` | `stdio` | `sse` | `http` |
|---|---|---|---|---|
| Production (`NODE_ENV=production`) | **Allowed** | Blocked | **Blocked** | Blocked |
| Dev/local | Allowed | Allowed | Blocked | Blocked |

### Implementation

**MCP service initialization** (`plugin-mcp/service.ts`):
```
For each server config:
  if (NODE_ENV === "production" && config.type !== "streamable-http"):
    log warning, skip server
  if (config.type === "sse"):
    log deprecation, skip server (all environments)
```

**Route-level enforcement** (all `app/api/mcps/*/[transport]/route.ts`):
```
if (params.transport !== "streamable-http"):
  return Response(405, "Only streamable-http transport supported")
```

**SSE stream endpoint** (`app/api/mcp/stream/route.ts`):
```
Return 410 Gone with message: "SSE streaming deprecated. Use streamable-http transport."
```

**Registry/list metadata**: Update all transport references from `"sse"` → `"streamable-http"`.

**Runtime factory** (`lib/eliza/runtime-factory.ts`):
```
MCP_SERVER_CONFIGS URLs: /api/mcps/{provider}/streamable-http (not /mcp or /sse)
```

---

## 9. Vercel Serverless Constraints (Reference)

These are hard facts from research, not proposals:

| Fact | Implication |
|---|---|
| Warm instances persist **up to 14 days** (Pro) | Module-level singletons with auth state = stale for days |
| **No cross-instance in-memory invalidation** | Only new deployment replaces all instances |
| Fluid Compute: **250+ concurrent requests per instance** | Singletons shared across concurrent requests — must be thread-safe |
| **AsyncLocalStorage reliable** within `.run()` scope | Safe for per-request auth in MCP route handlers |
| **AsyncLocalStorage broken** across middleware → handler | Never set context in middleware expecting it in route handler |
| Neon DB connections timeout after **15min inactivity** | Pool health checks needed; don't assume connections are alive |
| Function timeout: **60s default, 300s max** | Multi-step loop (6 iterations) must complete within 60s |

---

## 10. Multi-Step Loop Integration

### Minimal Change to CloudBootstrapMessageService

The multi-step loop requires one small change: after executing an action, check if `actionName === "SEARCH_ACTIONS"` and `result.success === true`. If so, **do not** push the result to `traceActionResult[]`. This implements the transparency rule from Section 4.3. All other actions (including SEARCH_ACTIONS errors) are recorded normally.

### Example Flow: User Asks "Show me recent commits on the eliza repo"

```
Iteration 1:
  ACTIONS provider → validates all runtime.actions
  LLM sees: Tier-1 (github_list_repos, github_list_prs, ...) + SEARCH_ACTIONS + LIST_CONNECTIONS
  LLM thinks: "I need to list commits. I don't see a list_commits action. Let me search."
  LLM calls: SEARCH_ACTIONS({ query: "list commits repository", platform: "github" })

  SEARCH_ACTIONS handler:
    → BM25 search finds: GITHUB_LIST_COMMITS (score 8.2), GITHUB_GET_COMMIT (score 5.1)
    → Registers both as real actions on runtime.actions
    → Returns { success: true, data: { newlyRegistered: [...] } }
    → Result NOT pushed to traceActionResult[] (transparency rule)

Iteration 2:
  refreshStateAfterAction() → recomposes state
  ACTIONS provider → validates all runtime.actions (now includes GITHUB_LIST_COMMITS!)

  # Previous Action Results
  (empty — SEARCH_ACTIONS was transparent)

  # Available Actions (with parameter schemas)
  ... Tier-1 + SEARCH_ACTIONS + LIST_CONNECTIONS ...
  GITHUB_LIST_COMMITS({ owner: string, repo: string, sha?: string, per_page?: number })
  GITHUB_GET_COMMIT({ owner: string, repo: string, ref: string })

  LLM sees GITHUB_LIST_COMMITS as a normal action. No awareness that SEARCH_ACTIONS ran.
  LLM calls: GITHUB_LIST_COMMITS({ owner: "elizaOS", repo: "eliza", per_page: 10 })

  Normal action execution via McpService.callTool("github", "list_commits", params)
  → Per-request token fetch → API call → results

Iteration 3:
  # Previous Action Results
  1. GITHUB_LIST_COMMITS - Success
     Output: [commit list...]

  LLM sees commit results. Sets isFinish=true.

Summary Phase:
  Character personality applied
  LLM synthesizes: "Here are the recent commits on the eliza repo: ..."
```

### Example Flow: User Asks "Create a Linear issue" (Tier-1, No Search Needed)

```
Iteration 1:
  LLM sees: linear_create_issue in Tier-1 actions
  LLM calls: linear_create_issue({ title: "Fix bug", ... })
  Normal execution. No SEARCH_ACTIONS needed.

Iteration 2:
  LLM sets isFinish=true

Summary Phase: "I've created the Linear issue 'Fix bug'..."
```

---

## 11. File-Level Implementation Plan

### P0 — Transport Policy Lock (Short, 1-4h)

| File | Change |
|---|---|
| `lib/eliza/plugin-mcp/types.ts` | Remove `sse` and `http` from transport type union. Keep `streamable-http` + `stdio` |
| `lib/eliza/plugin-mcp/service.ts` | Remove SSE transport import/branches. Add prod transport guard: skip non-streamable-http servers in production |
| `lib/eliza/runtime-factory.ts` | Update `MCP_SERVER_CONFIGS` URLs to `/api/mcps/{provider}/streamable-http` |
| `app/api/mcp/stream/route.ts` | Return `410 Gone` with deprecation message |
| `app/api/mcp/registry/route.ts` | Update built-in registry transport metadata to `streamable-http` |
| `app/api/mcp/list/route.ts` | Update tool list transport metadata to `streamable-http` |
| `app/api/mcp/info/route.ts` | Update transport references |
| All `app/api/mcps/*/[transport]/route.ts` (12 files) | Add route param validation: reject non-`streamable-http` with 405 |
| `app/api/mcps/time/[transport]/route.ts` | Same validation |
| `app/api/mcps/weather/[transport]/route.ts` | Same validation |
| `app/api/mcps/crypto/[transport]/route.ts` | Same validation |

### P1 — Two-Tier Visibility + Meta-Actions (Medium, 1-2d)

| File | Change |
|---|---|
| **New:** `lib/eliza/plugin-mcp/tool-visibility.ts` | `CRUCIAL_TOOLS` map per provider + `isCrucialTool(server, tool)` function |
| **New:** `lib/eliza/plugin-mcp/search/bm25-index.ts` | `Tier2ToolIndex` class wrapping BM25 from `@elizaos/core` |
| **New:** `lib/eliza/plugin-mcp/actions/search-actions.ts` | `SEARCH_ACTIONS` action — BM25 search + dynamic registration |
| **New:** `lib/eliza/plugin-mcp/actions/list-connections.ts` | `LIST_CONNECTIONS` action — OAuth status check |
| `lib/eliza/plugin-mcp/service.ts` | Split tool registration: Tier-1 → `registerToolsAsActions()`, Tier-2 → `tier2Index.build()`. Expose `getTier2Index()` and `getTier2Tools()` |
| `lib/eliza/plugin-mcp/actions/dynamic-tool-actions.ts` | No changes needed — `createMcpToolAction()` already produces standard actions |
| `lib/eliza/plugin-mcp/index.ts` | Add `SEARCH_ACTIONS` and `LIST_CONNECTIONS` to plugin `actions` array |
| `lib/eliza/plugin-mcp/provider.ts` | Update MCP provider text: show Tier-1 tools + "N additional tools available via SEARCH_ACTIONS" |
| `lib/eliza/plugin-cloud-bootstrap/services/cloud-bootstrap-message-service.ts` | After action execution: if `actionName === "SEARCH_ACTIONS" && result.success`, skip pushing to `traceActionResult[]` (transparency rule, Section 4.3) |

### P2 — OAuth Cache Versioning (Medium, 1-2d)

| File | Change |
|---|---|
| **New:** `lib/services/oauth/cache-version.ts` | `getOAuthVersion(orgId, platform)`, `incrementOAuthVersion(orgId, platform)` helpers using Redis INCR |
| `lib/services/oauth/token-cache.ts` | Change key format to `oauth_token:v{version}:{orgId}:{connectionId}`. Remove SWR for token cache. Add version parameter to `get()` and `set()` |
| `lib/services/oauth/oauth-service.ts` | Integrate version read in `getValidTokenByPlatform()`. Integrate version increment in connect/disconnect/refresh flows |
| `lib/services/oauth/connection-adapters/generic-adapter.ts` | After successful token refresh: call `incrementOAuthVersion()` |
| `lib/cache/client.ts` | Add `incr(key)` and `expire(key, ttl)` methods if not already present |
| `app/api/v1/oauth/[platform]/callback/route.ts` | After successful OAuth: `await incrementOAuthVersion(orgId, platform)` |
| `app/api/v1/oauth/connections/[id]/route.ts` | Before revoke: `await incrementOAuthVersion(orgId, platform)` |

### Delivery Order

```
P0 (Transport) → P1 (Two-Tier + Meta) → P2 (OAuth Versioning)
     1-4h              1-2 days              1-2 days
```

P0 is a prerequisite for P1 (clean transport before building on it).
P1 and P2 are independent — can be parallelized if needed.

---

## 12. Risk Assessment

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | BM25 search quality insufficient for tool discovery | Medium | Field boosts on name (3x) ensure exact matches rank highest. Start with limit=8 for focused results. Can tune k1/b parameters based on usage data. |
| 2 | Tier-1 list misses tools users frequently need | Low | Start conservative (3-5 per provider). Add usage analytics to identify frequently-searched Tier-2 tools. Promote to Tier-1 based on data. |
| 3 | Dynamic action registration causes naming collisions | Low | `createMcpToolAction()` already handles collisions with `_2`, `_3` suffixes. Existing mechanism. |
| 4 | Transport removal breaks existing user MCP configs | Medium | Config migration: log warnings for deprecated transport in dev. Character MCP configs auto-built from `MCP_SERVER_CONFIGS` which we control. |
| 5 | OAuth version counter adds Redis latency | Low | Single `INCR` is <1ms on Upstash. Version read parallelized with token read. Net neutral or faster than SWR revalidation. |
| 6 | Two-iteration pattern (search → execute) slower than direct | Low | Only for long-tail tools. Crucial actions (80% of usage) still execute in 1 iteration. Extra iteration adds ~2-3s. |
| 7 | BM25 index memory footprint with 500+ Tier-2 tools | Low | BM25 uses typed arrays (Uint32Array). 500 tools ≈ 100KB. Negligible vs runtime memory. |

---

## Appendix A: BM25 API Reference (from @elizaos/core)

```typescript
import { BM25 } from "@elizaos/core";

const bm25 = new BM25(docs, {
  k1: 1.2,                                    // Term frequency saturation
  b: 0.75,                                    // Document length normalization
  fieldBoosts: { name: 3.0, description: 1.5, tags: 1.0 },
  stemming: false,
});

const results: SearchResult[] = bm25.search("list commits", 8);
// returns: [{ index: number, score: number, doc?: Record<string, unknown> }]
```

Located at: `eliza/packages/core/src/search.ts` (1,533 lines)
Currently used by: `Runtime.rerankMemories(query, memories)` — ephemeral per query.

## Appendix B: Existing Files Reference

| Component | File Path |
|---|---|
| MCP Service | `lib/eliza/plugin-mcp/service.ts` (via `plugin-mcp/` external package) |
| Dynamic Tool Actions | `lib/eliza/plugin-mcp/actions/dynamic-tool-actions.ts` |
| Action Naming | `lib/eliza/plugin-mcp/utils/action-naming.ts` |
| MCP Provider | `lib/eliza/plugin-mcp/provider.ts` |
| MCP Plugin Entry | `lib/eliza/plugin-mcp/index.ts` |
| Schema Converter | `lib/eliza/plugin-mcp/utils/schema-converter.ts` |
| Runtime Factory | `lib/eliza/runtime-factory.ts` |
| Cloud Bootstrap Message Service | `lib/eliza/plugin-cloud-bootstrap/services/cloud-bootstrap-message-service.ts` |
| ACTIONS Provider | `lib/eliza/plugin-cloud-bootstrap/providers/actions.ts` |
| ACTION_STATE Provider | `lib/eliza/plugin-cloud-bootstrap/providers/action-state.ts` |
| OAuth Service | `lib/services/oauth/oauth-service.ts` |
| Token Cache | `lib/services/oauth/token-cache.ts` |
| Generic Adapter | `lib/services/oauth/connection-adapters/generic-adapter.ts` |
| Auth Context | `app/api/mcp/lib/context.ts` |
| Main MCP Route | `app/api/mcp/route.ts` |
| OAuth Callback | `app/api/v1/oauth/[platform]/callback/route.ts` |
| MCP Registry | `app/api/mcp/registry/route.ts` |
| SSE Stream | `app/api/mcp/stream/route.ts` |
