# Test Failure Assessment

This document categorizes the 173 failing tests (and 4 errors) from `bun test`, with root causes and suggested fixes.

---

## Summary by root cause

| Category | Approx. count | Root cause |
|----------|---------------|------------|
| **DATABASE_URL missing** | ~90+ | Tests hit code paths that use `db/client`, `db/repositories`, or `tests/infrastructure/local-database.ts`; env not set in CI/local. |
| **Playwright not installed** | 4 (errors) | Tests in `tests/playwright/*.spec.ts` import `@playwright/test`; package is optional/dev. |
| **Server-wallets mock mismatch** | 1 | Test mocks `db` with wrong shape; implementation uses Drizzle `select/from/where(sql...)`, not `insert`/`query`. |
| **N8N bridge expectation outdated** | 1 | `buildData` now returns `{ apiKey, url, organizationId, header }`; test expects only `{ apiKey, url }`. |
| **Idempotency needs DB** | 12 | Idempotency utils use `dbRead`/`dbWrite`; tests fail when DB unavailable or schema not migrated. |
| **Integration tests need DB** | 3 | Affiliate, revenue-splits, phone-mapping, webhooks use `dbWrite`/fixtures; need DATABASE_URL. |
| **API tests expect 401 / live server** | ~30+ | Promotion, Twitter, Discord, Telegram, MCP Registry, etc. hit live server; expect 401 without auth or 200 with specific response. Fail when server not running (404), wrong response code, or env (TEST_API_KEY) changes behavior. |
| **Runtime/performance tests need DB** | ~15+ | Message handler, runtime factory, caching, embedding init use `local-database.ts` `verifyConnection()` which requires DATABASE_URL. |

---

## 1. DATABASE_URL not set (~90+ failures)

**Affected:** BlooioAutomationService, MessageRouterService, TwilioAutomationService, and any test that (transitively) loads code calling `db/client.ts` (e.g. `getPrimaryDatabaseUrl()`, `getWriteConnection()`, `getReadConnection()`), or `tests/infrastructure/local-database.ts` `getConnectionString()`.

**Error:**  
`DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.`  
or  
`DATABASE_URL environment variable is required. Make sure your .env is loaded.`

**Why:**  
- Blooio/Twilio/MessageRouter tests instantiate services that eventually call secrets/db (e.g. `getApiKey` → secrets → db).
- No `.env` / `.env.local` in the test run, or `bun test` doesn’t load env for those tests.

**Fix options:**  
- Load env in test setup (e.g. `dotenv` from `.env.local`) before tests run, or set `DATABASE_URL` in CI.  
- Or mock `@/db/client` (and optionally `@/lib/services/secrets`) in unit tests so they never touch the real DB.

---

## 2. Playwright not found (4 errors)

**Affected:**  
`tests/playwright/generate-image.spec.ts`, `auth-routing.spec.ts`, `uuid-sanitization.spec.ts`, `toctou-race-condition.spec.ts`

**Error:**  
`Cannot find module '@playwright/test' from '...'`

**Why:**  
`@playwright/test` is optional or not installed; Bun still tries to run these files.

**Fix options:**  
- Add `@playwright/test` to devDependencies and run Playwright tests separately (e.g. `bun run test:playwright`).  
- Or exclude `tests/playwright/**` from `bun test` (e.g. in package.json test script or via `--ignore`).

---

## 3. server-wallets integration test (1 failure)

**Test:** `tests/integration/server-wallets.test.ts` → “provisionServerWallet > should call privy to create wallet and insert to db”

**Why:**  
- Implementation uses Drizzle: `db.select().from(agentServerWallets).where(sql\`client_address = ${clientAddress}\`).limit(1)` and later `db.insert(agentServerWallets).values(...)`.  
- Test mocks `db` as `{ insert: vi.fn(), query: { agentServerWallets: { findFirst: vi.fn() } } }`, which doesn’t match the select/from/where/insert API.  
- So the real `db` (or a partial mock) is used and either throws (e.g. `sql` not mocked) or doesn’t behave as the test expects.

**Fix:**  
Update the mock to match Drizzle usage: e.g. mock `db.select().from(...).where(...).limit(1)` to return `[]`, and `db.insert(...).values(...).returning(...)` to return the inserted row. Alternatively, use a test DB and don’t mock `db`.

---

## 4. N8N bridge API key cred map (1 failure)

**Test:** `tests/unit/n8n-bridge-apikey-cred-map.test.ts` → “openAiApi builds correct data payload”

**Why:**  
`lib/eliza/plugin-n8n-bridge/apikey-cred-map.ts` `buildData` returns:

```ts
{ apiKey, organizationId: "", url: `${baseUrl}/api/v1`, header: false }
```

Test expects:

```ts
{ apiKey: "eliza_test123", url: "https://cloud.elizaos.com/api/v1" }
```

So the test fails on the extra fields and/or missing `organizationId`/`header` in the expectation.

**Fix:**  
Update the test expectation to include `organizationId: ""` and `header: false`, or use `expect(data).toMatchObject({ apiKey: "...", url: "..." })` and optionally assert the rest.

---

## 5. Idempotency utility tests (12 failures)

**Affected:**  
`tests/unit/idempotency.test.ts` — isAlreadyProcessed, markAsProcessed, tryClaimForProcessing, releaseProcessingClaim, cleanupExpiredKeys, security tests.

**Why:**  
- Idempotency uses `dbRead`/`dbWrite` and table `idempotency_keys`.  
- Without DATABASE_URL, DB calls throw; with DB but no migration, table may be missing.  
- Tests expect specific booleans/behavior; they get exceptions or wrong results.

**Fix options:**  
- Run these tests only when DATABASE_URL is set and migrations are applied (e.g. CI with test DB).  
- Or skip in envs without DB: `if (!process.env.DATABASE_URL) return describe.skip("Idempotency Utility", () => { ... });`  
- Or mock `@/db/client` so idempotency functions use in-memory/fake storage for unit tests.

---

## 6. Integration tests requiring DB (3+ failures)

**Affected:**  
- `tests/integration/affiliates-service.test.ts` — setupFixtures uses `dbWrite.insert(users)`; fails without DATABASE_URL.  
- `tests/integration/revenue-splits.test.ts` — same pattern.  
- `tests/integration/phone-mapping-e2e.test.ts`, `webhooks-e2e.test.ts` — require DATABASE_URL and likely a running server.

**Fix:**  
Ensure DATABASE_URL is set and migrations are run before integration tests; or skip these when DATABASE_URL is unset.

---

## 7. API integration tests expecting 401 or live server (~30+)

**Affected (examples):**  
Promotion Preview API (“returns 401 without auth”), Twitter Status/Connect/Disconnect, App Twitter Automation/Post, Discord Connections, Telegram Status/Connect/Disconnect, App Promote Assets, MCP Registry API, etc.

**Why:**  
- Tests call real endpoints (e.g. `http://localhost:3000/...`) without auth and expect 401.  
- If the server isn’t running, they get network/404 errors.  
- If the server is running but the route returns something else (e.g. 200 for unauthenticated registry), expectation fails.  
- Some tests may also depend on TEST_API_KEY / TEST_SERVER_URL and change behavior when those are set.

**Fix options:**  
- Run a real server (and optional test DB) before integration tests, and keep 401 behavior consistent.  
- Or mock the fetch layer so “no auth” requests return 401 without needing a server.  
- Document that these tests are “live API” tests and require `TEST_SERVER_URL` (and optionally TEST_API_KEY).

---

## 8. Runtime / performance / message-handler tests (~15+)

**Affected:**  
Message Handler - Basic Message Processing, Embedding Initialization Performance, Runtime Creation Performance, Database Query Performance, Runtime Caching Performance, RuntimeFactory (CHAT/ASSISTANT/BUILD mode, caching, benchmarks), MCP Plugin Loading, CloudBootstrapMessageService, etc.

**Why:**  
They call `verifyConnection()` from `tests/infrastructure/local-database.ts`, which uses `getConnectionString()` and throws if `DATABASE_URL` is missing.

**Fix:**  
Set DATABASE_URL (and run migrations) for these tests, or skip them when DATABASE_URL is unset so the suite doesn’t fail in envs without a DB.

---

## Implemented fixes (low-hanging fruit)

- **Env preload:** `bun run test` uses `--preload ./tests/load-env.ts` to load `.env`, `.env.local`, and `.env.test`, so `DATABASE_URL` is available when present.
- **Playwright excluded:** Default `bun run test` runs only `tests/unit`, `tests/integration`, and `tests/runtime` (no `tests/playwright`). Use `bun run test:playwright` for Playwright.
- **server-wallets mock:** Mock updated to include `db.select().from().where().limit()` chain so provision test passes.
- **n8n-bridge test:** Expected payload updated to include `organizationId` and `header`.
- **DB-dependent skips:** Suites that require `DATABASE_URL` use `describe.skipIf(!process.env.DATABASE_URL)` or `describe.skipIf(!hasDatabaseUrl)` so they are skipped when no DB is configured. With `DATABASE_URL` set and migrations applied, those tests run. Remaining failures are mostly API/live-server tests that expect a running server.

---

## Recommended next steps

1. **Env and CI:**  
   - Load `.env`/`.env.test`/`.env.local` in test setup when present.  
   - In CI, set DATABASE_URL (and run migrations) for integration/runtime tests, or explicitly skip tests that require DB.

2. **Unit tests that touch DB:**  
   - Prefer mocking `@/db/client` (and secrets where needed) so unit tests don’t require a real DB.  
   - Keep a smaller set of integration tests that require a real DB and run them only when DATABASE_URL is set.

3. **Single-file fixes:**  
   - **server-wallets:** Adjust mock to Drizzle’s select/from/where/insert API (or use test DB).  
   - **n8n-bridge-apikey-cred-map:** Update expected payload to include `organizationId` and `header`, or use `toMatchObject`.

4. **Playwright:**  
   - Either add `@playwright/test` and run Playwright separately, or exclude `tests/playwright/**` from `bun test`.

5. **Documentation:**  
   - In README or `docs/testing.md`, state which tests need DATABASE_URL, a running server, and optional env vars (TEST_API_KEY, TEST_SERVER_URL).
