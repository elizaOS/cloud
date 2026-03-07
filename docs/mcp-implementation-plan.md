# MCP Implementation Plan — Dependency Graph & Tasks

## Dependency Graph

```
P0.1 ──┐
P0.2 ──┤
P0.3 ──┼── P0 GATE ──┬── P1.1 (tool-visibility) ──┬── P1.3 (SEARCH_ACTIONS) ──┐
P0.4 ──┤             │                             │                           │
P0.5 ──┤             ├── P1.2 (bm25-index) ────────┤                           │
P0.6a ─┤             │                             │                           ├── P1.6 (plugin index)
P0.6b ─┤             ├── P1.4 (LIST_CONNECTIONS) ──┘                           │
P0.6c ─┘             │                                                         │
                     ├── P1.5 (service split) ──── P1.7 (provider text) ───────┘
                     │
                     └── P2.1 (cache-version) ──┬── P2.2 (token-cache) ──┐
                         P2.5 (cache client) ───┤                        ├── P2.3 (oauth-service)
                                                └── P2.6 (callback) ────┤
                                                    P2.7 (revoke) ──────┘
```

## 10 Parallel Work Streams

Designed to **minimize file overlap** so worktrees don't conflict on merge.

### Stream 1: Plugin-MCP Transport Cleanup
**Worktree:** `wt-01-transport-cleanup`
**Files:**
- `plugin-mcp/src/types.ts` — remove `sse`/`http` from union
- `plugin-mcp/src/service.ts` — remove SSE import/branches, add prod transport guard
- `plugin-mcp/src/transports/` — remove SSE transport if separate file

**Depends on:** Nothing
**Blocks:** Streams 7, 8, 9

---

### Stream 2: Runtime Factory Config
**Worktree:** `wt-02-runtime-config`
**Files:**
- `lib/eliza/runtime-factory.ts` — update `MCP_SERVER_CONFIGS` URLs to `/streamable-http`

**Depends on:** Nothing
**Blocks:** Nothing (independent)

---

### Stream 3: SSE Endpoint Kill + Metadata
**Worktree:** `wt-03-sse-kill`
**Files:**
- `app/api/mcp/stream/route.ts` — return 410 Gone
- `app/api/mcp/registry/route.ts` — update transport metadata
- `app/api/mcp/list/route.ts` — update transport metadata
- `app/api/mcp/info/route.ts` — update transport references

**Depends on:** Nothing
**Blocks:** Nothing

---

### Stream 4: Provider Route Validation (Google, Linear, GitHub, Notion)
**Worktree:** `wt-04-routes-batch1`
**Files:**
- `app/api/mcps/google/[transport]/route.ts`
- `app/api/mcps/linear/[transport]/route.ts`
- `app/api/mcps/github/[transport]/route.ts`
- `app/api/mcps/notion/[transport]/route.ts`

**Change:** Add transport param validation, reject non-streamable-http
**Depends on:** Nothing
**Blocks:** Nothing

---

### Stream 5: Provider Route Validation (Asana, Dropbox, Salesforce, Airtable)
**Worktree:** `wt-05-routes-batch2`
**Files:**
- `app/api/mcps/asana/[transport]/route.ts`
- `app/api/mcps/dropbox/[transport]/route.ts`
- `app/api/mcps/salesforce/[transport]/route.ts`
- `app/api/mcps/airtable/[transport]/route.ts`

**Change:** Same transport validation
**Depends on:** Nothing
**Blocks:** Nothing

---

### Stream 6: Provider Route Validation (Zoom, Jira, LinkedIn, Microsoft + Utilities)
**Worktree:** `wt-06-routes-batch3`
**Files:**
- `app/api/mcps/zoom/[transport]/route.ts`
- `app/api/mcps/jira/[transport]/route.ts`
- `app/api/mcps/linkedin/[transport]/route.ts`
- `app/api/mcps/microsoft/[transport]/route.ts`
- `app/api/mcps/time/[transport]/route.ts`
- `app/api/mcps/weather/[transport]/route.ts`
- `app/api/mcps/crypto/[transport]/route.ts`

**Change:** Same transport validation
**Depends on:** Nothing
**Blocks:** Nothing

---

### Stream 7: Tool Visibility + BM25 Index (NEW FILES)
**Worktree:** `wt-07-tool-visibility`
**Files (all new):**
- `plugin-mcp/src/tool-visibility.ts` — CRUCIAL_TOOLS map + `isCrucialTool()`
- `plugin-mcp/src/search/bm25-index.ts` — `Tier2ToolIndex` class wrapping BM25

**Depends on:** Stream 1 (transport types)
**Blocks:** Stream 8, 9

---

### Stream 8: Meta-Actions (NEW FILES)
**Worktree:** `wt-08-meta-actions`
**Files (all new):**
- `plugin-mcp/src/actions/search-actions.ts` — SEARCH_ACTIONS
- `plugin-mcp/src/actions/list-connections.ts` — LIST_CONNECTIONS

**Depends on:** Stream 7 (needs Tier2ToolIndex, isCrucialTool)
**Blocks:** Stream 9

---

### Stream 9: Plugin-MCP Service Split + Provider + Index
**Worktree:** `wt-09-service-split`
**Files:**
- `plugin-mcp/src/service.ts` — split Tier-1/Tier-2 registration, build BM25 index
- `plugin-mcp/src/provider.ts` — update text: show Tier-1 + discoverable count
- `plugin-mcp/src/index.ts` — register SEARCH_ACTIONS + LIST_CONNECTIONS

**Depends on:** Streams 7, 8
**Blocks:** Nothing

---

### Stream 10: OAuth Cache Versioning
**Worktree:** `wt-10-oauth-versioning`
**Files:**
- **New:** `lib/services/oauth/cache-version.ts`
- `lib/services/oauth/token-cache.ts`
- `lib/services/oauth/oauth-service.ts`
- `lib/services/oauth/connection-adapters/generic-adapter.ts`
- `lib/cache/client.ts` (add `incr`/`expire` if missing)
- `app/api/v1/oauth/[platform]/callback/route.ts`
- `app/api/v1/oauth/connections/[id]/route.ts`

**Depends on:** Nothing (independent of P0/P1)
**Blocks:** Nothing

---

## Execution Waves

```
WAVE 1 (all parallel, no dependencies):
  Stream 1:  Transport cleanup         ← P0
  Stream 2:  Runtime factory config    ← P0
  Stream 3:  SSE kill + metadata       ← P0
  Stream 4:  Routes batch 1            ← P0
  Stream 5:  Routes batch 2            ← P0
  Stream 6:  Routes batch 3            ← P0
  Stream 10: OAuth versioning          ← P2 (independent)

WAVE 2 (after Stream 1 completes):
  Stream 7:  Tool visibility + BM25    ← P1

WAVE 3 (after Stream 7 completes):
  Stream 8:  Meta-actions              ← P1

WAVE 4 (after Streams 7+8 complete):
  Stream 9:  Service split + index     ← P1
```

## Merge Order

```
1. Merge Streams 2-6 into feature branch (no conflicts, independent files)
2. Merge Stream 1 (transport types — may touch same files as Stream 9)
3. Merge Stream 10 (OAuth — independent files)
4. Merge Stream 7 (new files only — no conflicts)
5. Merge Stream 8 (new files only — no conflicts)
6. Merge Stream 9 (touches service.ts, provider.ts, index.ts — last because most integration)
7. Final typecheck on feature branch
```
