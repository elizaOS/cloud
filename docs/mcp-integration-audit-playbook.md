# MCP Integration Audit Playbook

Context doc based on the full audit of `twitter.ts` (23 tools). Apply this same process to every external integration.

## Integrations to audit

| Integration | File | Tools | Crucial (Tier 1) |
|-------------|------|------:|-------------------|
| Google | `tools/google.ts` | 9 | gmail_list, gmail_send, calendar_list_events, calendar_create_event |
| Linear | `tools/linear.ts` | 27 | list_issues, create_issue, update_issue, list_projects |
| GitHub | `tools/github.ts` | 46 | list_repos, list_prs, create_issue, create_pr |
| Notion | `tools/notion.ts` | 21 | search, get_page, create_page, query_data_source |
| Asana | `tools/asana.ts` | 14 | list_projects, list_tasks, create_task, update_task |
| Dropbox | `tools/dropbox.ts` | 15 | list_folder, search, upload_text, create_shared_link |
| Salesforce | `tools/salesforce.ts` | 11 | query, search, get_record, update_record |
| Airtable | `tools/airtable.ts` | 13 | list_bases, list_records, search_records, create_records |
| Zoom | `tools/zoom.ts` | 7 | list_meetings, get_meeting, create_meeting, update_meeting |
| Jira | `tools/jira.ts` | 14 | search_issues, get_issue, create_issue, update_issue |
| LinkedIn | `tools/linkedin.ts` | 4 | get_profile, create_post, delete_post |
| Microsoft | `tools/microsoft.ts` | — | outlook_list, outlook_send, calendar_list/create |

---

## Phase 1 — UX Gap Analysis

### What we found in Twitter

Users in production asked natural questions that the tools couldn't handle:

| User request | What failed | Root cause |
|-------------|------------|------------|
| "Show me my posts from last week" | Blank/error | No date filtering (`startTime`/`endTime` params missing) |
| "Show me ALL my tweets from January" | Only got 10 results | No pagination support (`paginationToken` param missing) |
| "Filter my posts by keyword" | Not possible | No search-within-timeline capability; needed `twitter_search_tweets` with `from:username` operator |
| "Who mentioned me?" | Tool didn't exist | No mentions endpoint |
| "Show my likes / bookmarks" | Tools didn't exist | Missing liked-tweets and bookmarks endpoints |
| "Does X follow me?" | No way to check | Missing relationship/friendship endpoint |
| "Post a thread" | Not possible | No multi-tweet thread tool |
| Pasted a tweet URL | Couldn't resolve it | No URL-to-tweet-ID resolver |

### How to find these gaps in other integrations

1. **Think like the user** — list the 10 most natural questions a user would ask for each integration
2. **Map questions to tools** — for each question, does a tool exist? Does it have the right parameters?
3. **Check for missing params** — pagination, date filtering, sorting, search/filtering within results
4. **Check for missing tools** — CRUD completeness, relationship queries, bulk operations, status/connection check

### Checklist per integration

- [ ] Does `{integration}_status` tool exist? (connection health check)
- [ ] Can the user paginate through large result sets? (`paginationToken` / `nextToken`)
- [ ] Can the user filter by date range? (`startTime` / `endTime`)
- [ ] Can the user search/filter within results? (keyword, status, label)
- [ ] Are all CRUD operations covered? (create, read, update, delete)
- [ ] Can the user reference items by URL/link, not just ID?
- [ ] Are relationship queries possible? (e.g., "who follows me", "who's assigned to this")

---

## Phase 2 — Implementation Patterns

### Patterns established in Twitter (copy these)

#### 1. Shared field selections (avoid repeating field lists)

```typescript
const TIMELINE_TWEET_FIELDS = ["created_at", "public_metrics", "entities", "referenced_tweets"];
const SEARCH_TWEET_FIELDS = ["created_at", "public_metrics", "author_id", "entities"];
```

**Apply to**: Any integration where multiple tools request the same API with different field subsets (e.g., GitHub issue fields, Linear issue fields, Jira issue fields).

#### 2. Shared mappers (normalize API responses)

```typescript
function mapTweetSummary(t: Record<string, unknown>): Record<string, unknown> {
  return { id: t.id, text: t.text, createdAt: t.created_at, publicMetrics: t.public_metrics };
}
```

**Why**: API responses often have snake_case or inconsistent shapes. A mapper gives the LLM a predictable, camelCase structure every time.

**Apply to**: Every integration. The LLM works better with consistent field names across tools.

#### 3. Shared fetchers (eliminate copy-paste between similar tools)

```typescript
async function fetchUserTimeline(client, userId, { maxResults, startTime, endTime, exclude, paginationToken }) {
  // Build opts, call API, return paginatedTweetResponse(...)
}
```

Twitter had `get_my_tweets` and `get_user_tweets` doing nearly identical work. A shared fetcher eliminated the duplication.

**Apply to**: Any integration where "get my X" and "get user's X" share logic (GitHub repos, Linear issues, Jira issues).

#### 4. Paginated response envelope

```typescript
function paginatedTweetResponse(items, meta, extra = {}) {
  return {
    resultCount: items.length,
    newestDate: items[0]?.created_at ?? null,
    oldestDate: items[items.length - 1]?.created_at ?? null,
    nextToken: meta?.next_token ?? null,
    items: items.map(mapSummary),
    ...extra,
  };
}
```

Every paginated tool returns the same shape: count, date range, nextToken, items. The LLM knows to ask for `nextToken` to get more results.

**Apply to**: Every tool that returns a list. If the API supports pagination, expose `nextToken` in the response and `paginationToken` as an input param.

#### 5. Enriched tool descriptions (guide the LLM)

```typescript
description: "Search for recent tweets matching a query (last 7 days only). Supports date filtering within that window, sorting, and pagination. Use Twitter search operators like from:username, #hashtag, has:media. For older tweets from a specific user, use twitter_get_user_tweets with date filters instead."
```

**Key elements**:
- What the tool does (one sentence)
- Known limitations (e.g., "last 7 days only")
- What parameters are available
- What operators/syntax are supported
- When to use a different tool instead

Bad description: `"Search tweets"` — the LLM has no idea about limitations or alternatives.

#### 6. errMsg helper (enrich error messages)

```typescript
function errMsg(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const err = error as Error & { code?: number; data?: { detail?: string }; rateLimit?: { remaining?: number; reset?: number } };
  const parts: string[] = [err.message];
  if (err.data?.detail) parts.push(err.data.detail);
  if (err.code) parts.push(`code: ${err.code}`);
  if (err.rateLimit?.remaining === 0 && err.rateLimit?.reset) {
    logger.warn(`[${INTEGRATION}MCP] Rate limit hit`, { code: err.code, resetAt: new Date(err.rateLimit.reset * 1000).toISOString() });
    parts.push(`rate limit resets at ${new Date(err.rateLimit.reset * 1000).toISOString()}`);
  }
  return parts.join(" — ");
}
```

Every API has its own error shape. The `errMsg` helper normalizes it. Adapt the type assertion per API library.

**Apply to**: Every integration. At minimum, extract the error message + API error code + rate limit info.

#### 7. Client factory with explicit credential validation

```typescript
async function getTwitterClient(): Promise<TwitterApi> {
  if (!API_KEY || !API_SECRET) {
    throw new Error("API credentials not configured at platform level.");
  }
  const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "twitter" });
  if (!result.accessTokenSecret) {
    throw new Error("Access token secret is missing. Reconnect in Settings > Connections.");
  }
  return new TwitterApi({ ... });
}
```

**Critical**: Never silently fall back to empty strings for credentials (`token || ""`). Validate explicitly and throw with actionable guidance.

**Apply to**: Every integration that uses OAuth tokens from `oauthService`.

#### 8. User ID cache (avoid redundant "who am I" calls)

```typescript
const userIdCache = new Map<string, { id: string; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 100;
```

Many tools need the authenticated user's ID. Caching it avoids an extra API call per tool invocation.

**Apply to**: Any integration where multiple tools call a "get me" endpoint (GitHub, Linear, Jira, etc.).

---

## Phase 3 — Error Handling & Logging Checklist

### Every tool handler MUST have

```typescript
async (args) => {
  try {
    const client = await getClient();
    // ... tool logic ...
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(errMsg(error, "Failed to <action>"));
  }
}
```

No exceptions. No unhandled throws. Every tool returns either `jsonResponse` or `errorResponse`.

### Logging levels (what we established)

| Event | Level | Visibility | Example |
|-------|-------|------------|---------|
| Auth/token failure | `logger.warn` | Always | `[XxxMCP] Failed to get token` |
| Rate limit hit | `logger.warn` | Always | `[XxxMCP] Rate limit hit` |
| Write operation success (irreversible) | `logger.warn` | Always | `[XxxMCP] Issue deleted`, `[XxxMCP] User followed` |
| Write operation success (reversible) | `logger.info` | Verbose only | `[XxxMCP] Tweet created`, `[XxxMCP] Issue updated` |
| Partial failure (e.g., batch/thread) | `logger.error` | Always | `[XxxMCP] Batch partially failed` |

**Why `warn` for irreversible writes**: `logger.info` is gated behind `VERBOSE_LOGGING=true`. Deletes, follows, and other irreversible actions need an audit trail in production regardless of verbose mode.

### Audit per integration

- [ ] Every tool has try-catch with `errorResponse(errMsg(...))`
- [ ] Client factory validates credentials explicitly (no `|| ""` fallback)
- [ ] Auth failures are logged at `warn`
- [ ] Rate limit errors are logged at `warn` with reset time
- [ ] All write operations have success logging
- [ ] Irreversible writes (delete, unsubscribe) use `logger.warn`
- [ ] Multi-step operations (batch, thread) handle partial failure

---

## Phase 4 — Code Quality (the "4 Cs")

### Compact
- Extract shared field selections, mappers, and fetchers
- One tool = one responsibility (don't combine "get" and "search" into one mega-tool)

### Concise
- Tool descriptions: 1-2 sentences + limitations + alternatives
- Parameter descriptions: what it does + format + constraints
- No redundant optional chaining where values are guaranteed

### Clean
- Consistent naming: `{integration}_{verb}_{noun}` (e.g., `twitter_get_my_tweets`, `github_list_repos`)
- camelCase in responses (even if API returns snake_case) — use mappers
- No hedging in error messages ("may require" → "requires")

### Capable
- Every list tool supports pagination
- Every time-based tool supports date filtering
- URL/link resolution where applicable
- Both ID-based and name-based lookups where applicable

---

## Phase 5 — Testing Checklist

### Test file structure (from `mcp-twitter-tools.test.ts`)

```
tests/unit/mcp-{integration}-tools.test.ts
```

### What to mock vs. what to run for real

| Mock (external boundary) | Run for real (our code) |
|--------------------------|------------------------|
| API client library | Tool handler logic |
| `oauthService` | Mappers, helpers, validators |
| Network calls | Error formatting (`errMsg`) |
| | Auth context isolation |
| | Paginated response building |

### Test categories (minimum per integration)

1. **Registration**: exports function, registers expected tool count, all tool names present
2. **Connection status**: connected, not connected, filtered statuses, service failure
3. **Read tools**: returns mapped data, passes all optional params (date filters, pagination, maxResults, exclude), handles empty results, handles API errors
4. **Write tools**: happy path, reply/variant modes, auth failure, API failure
5. **Multi-step tools** (thread, batch): full success, partial failure with recovery data, auth failure before start
6. **URL/link resolution**: valid URLs (all domain variants), invalid URLs, empty input
7. **Relationship/status tools**: mutual, one-way, error
8. **Edge cases**: rate limit formatting, non-Error thrown objects, concurrent auth context isolation, undefined meta in paginated response, not-connected with helpful message

### Test principles

- Never mock the code under test
- Test error paths, not just happy paths
- Verify what gets passed to the API (mock.calls), not just what comes back
- Test that pagination token flows through correctly
- Test that date filters arrive at the API in the right param names

---

## Phase 6 — LARP Assessment (is the code real or performative?)

### What we caught in Twitter

| Finding | Severity | Pattern |
|---------|----------|---------|
| `getTwitterClient()` error unhandled in `create_thread` | CRITICAL | Unhandled async error path — wrapped in try-catch after |
| `accessTokenSecret \|\| ""` silently masks missing creds | MEDIUM | Silent fallback → added explicit validation |
| Engagement tool tests only cover happy path | MEDIUM | "Pass-through LARP" — tests exist but don't test failure |
| `paginatedTweetResponse` untested with `meta=undefined` | LOW | Edge case gap — API can return no meta object |
| Redundant optional chaining after Zod guarantees | LOW | Code looks defensive but condition is impossible |
| Hedging in error messages ("may require") | LOW | Imprecise language — the requirement is factual |

### LARP detection checklist

- [ ] Are there `|| ""` or `|| {}` fallbacks that mask missing data?
- [ ] Are there try-catch blocks that catch and ignore errors silently?
- [ ] Are there unawaited async calls?
- [ ] Are there tests that mock the code under test (instead of external deps)?
- [ ] Are there tests that only check happy paths for write operations?
- [ ] Are error messages accurate or do they hedge with "may", "might", "could"?
- [ ] Are there optional chains (`?.`) where the value is guaranteed non-null?
- [ ] Do multi-step operations handle failure at each step, or only at the end?

---

## Phase 7 — Production Readiness

### Checklist (from our validation)

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Tests pass | Run `bun test tests/unit/mcp-{integration}-tools.test.ts` — 0 failures |
| 2 | Error handling | Every tool has try-catch; `errMsg` enriches errors; rate limits logged |
| 3 | No hardcoded secrets | Grep for literal tokens, passwords, keys in the file |
| 4 | Performance | Check for caching, pagination (no auto-fetch-all), N+1 queries |
| 5 | Dependencies pinned | Check lockfile for exact version with integrity hash |
| 6 | Rollback safe | No DB migrations, no schema changes, backwards-compatible params |
| 7 | Monitoring | Auth failures → warn, rate limits → warn, writes → warn/info, partials → error |

---

## Execution order per integration

1. Read the tool file end-to-end
2. List all registered tools and their params
3. Run the UX gap analysis (Phase 1 checklist)
4. Implement missing tools/params using the patterns (Phase 2)
5. Audit error handling and add logging (Phase 3)
6. Code quality pass — 4 Cs (Phase 4)
7. Write comprehensive tests (Phase 5)
8. LARP assessment (Phase 6)
9. Production readiness check (Phase 7)
10. Self-review: "Does it actually work? What did I skip?"

---

## Reference files

| File | Purpose |
|------|---------|
| `app/api/mcp/tools/twitter.ts` | Gold standard — fully audited integration (23 tools) |
| `tests/unit/mcp-twitter-tools.test.ts` | Gold standard — 66 tests, 192 assertions |
| `app/api/mcp/lib/responses.ts` | `jsonResponse` / `errorResponse` helpers |
| `app/api/mcp/lib/context.ts` | `getAuthContext` / `authContextStorage` |
| `lib/services/oauth.ts` | `oauthService.getValidTokenByPlatform` / `listConnections` |
| `lib/utils/logger.ts` | Logger with levels: debug/info (verbose), warn/error (always) |
| `lib/eliza/plugin-mcp/tool-visibility.ts` | Tier 1 (crucial) vs Tier 2 (discoverable) tool config |
