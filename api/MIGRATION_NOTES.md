# API → Hono / Cloudflare Workers migration notes

This file is the running ledger for the Next.js → Hono conversion. It is
the coordination surface with Agent A (frontend) and Agent C (infra).
Update it as you convert routes.

## Status

Scaffold: complete. Codegen mounts every leaf in `cloud/api/` to a Hono
sub-app. 481 routes registered.

## Conversion progress

| Group | Total | Converted | Notes |
|-------|------:|----------:|-------|
| `health` | 1 | 1 | done |
| `og` | 1 | 0 | blocked: `next/og` |
| `openapi.json` | 1 | 1 | done — relies on `@/lib/docs/api-route-discovery` (Workers OK if it stays pure TS) |
| `anonymous-session` | 1 | 1 | done |
| `set-anonymous-session` | 1 | 1 | done |
| `auth` | TBD | 0 | |
| `credits` | TBD | 0 | |
| `quotas` | TBD | 0 | |
| `stats` | TBD | 0 | |
| `analytics` | TBD | 0 | |
| `agents` | TBD | 0 | many leaves call AWS / Headscale — partial blocker |
| `my-agents` | TBD | 0 | |
| `characters` | TBD | 0 | one leaf imports `@elizaos/plugin-mcp` (blocker) |
| `signup-code` / `invites` / `invoices` / `affiliate` / `feedback` | TBD | 0 | |
| `sessions` / `auto-top-up` / `organizations` / `privy` / `crypto` | TBD | 0 | |
| `stripe` / `webhooks` | TBD | 0 | webhook signature verification — Stripe SDK is edge-OK |
| `cron` | TBD | 0 | scheduled handler wired in `src/lib/cron.ts` |
| `elevenlabs` / `fal` | TBD | 0 | upstream proxies, should be straightforward |
| `eliza` / `eliza-app` / `mcp` / `mcps` / `a2a` | TBD | 0 | mostly Node-blocked (plugins) |
| `compat` / `internal` / `test` / `training` / `v1` | TBD | 0 | last priority |

(Numbers filled in as each group is touched.)

## Node-only blockers — need sidecar service

Routes that import packages or APIs that do not run on Cloudflare Workers.
These have been replaced with a 501 stub that preserves the URL and the
mount in the router. The original logic is kept in git history.

| Route file | Offending import | Suggested approach |
|------------|------------------|--------------------|
| `api/og/route.tsx` | `next/og` (`ImageResponse`) | run on a Node sidecar or use Cloudflare Image Resizing |
| `api/v1/containers/[id]/metrics/route.ts` | `@aws-sdk/client-cloudwatch` | move to a Node service that fronts AWS |
| `api/v1/containers/[id]/logs/route.ts` | `@aws-sdk/client-cloudwatch-logs` | same |
| `api/v1/containers/[id]/logs/stream/route.ts` | `@aws-sdk/client-cloudwatch-logs` (streaming) | same — also uses `ReadableStream`, fine on Workers but AWS SDK is the blocker |
| `api/v1/cron/deployment-monitor/route.ts` | `@aws-sdk/client-cloudformation` | same |
| `api/characters/[characterId]/mcps/route.ts` | `@elizaos/plugin-mcp` | call `services/agent-server` instead |
| `api/v1/reports/bug/route.ts` | `node:fs/promises` | use R2 or KV |
| `api/v1/app-builder/sessions/[sessionId]/terminal/route.ts` | `node:child_process` | move to sidecar |
| `api/v1/remote/pair/route.ts` | `node:child_process` | move to sidecar |
| `api/crypto/webhook/route.ts` | `node:fs/promises` (key load) | inline the key into env or use R2 |
| `api/auth/migrate-anonymous/route.ts` | `node:fs/promises` | replace with KV / inline data |
| `api/training/vertex/tune/route.ts` | `node:fs` | move to sidecar |
| `api/agents/[id]/headscale-ip/route.ts` | `node:child_process` (headscale CLI) | move to sidecar that owns the Headscale binary |

Use `grep -rl "@elizaos/plugin-\|@aws-sdk\|@vercel/blob\|@vercel/sandbox" api/ --include='route.ts'` to refresh the list.

## Env / bindings Agent C needs to add to `wrangler.toml`

These are read from `c.env` somewhere in the converted routes and must
exist as Worker bindings. Secrets should be set with `wrangler secret put`.

- `DATABASE_URL` (Neon pooled) — secret
- `DATABASE_URL_UNPOOLED` (optional, only if writes need direct conn) — secret
- `NEXT_PUBLIC_PRIVY_APP_ID` — var
- `PRIVY_APP_SECRET` — secret
- `STEWARD_API_URL` — var (optional; default `https://eliza.steward.fi`)
- `STEWARD_JWT_PUBLIC_KEY` — secret (only if Steward JWT verification stays in this Worker)
- `KV_REST_API_URL` — var (Upstash REST URL)
- `KV_REST_API_TOKEN` — secret
- `STRIPE_SECRET_KEY` — secret
- `STRIPE_WEBHOOK_SECRET` — secret
- `CRON_SECRET` — secret (shared between scheduled() and `/api/cron/*` routes)
- `NEXT_PUBLIC_APP_URL` — var (used to construct OpenAPI server URL and cron internal calls)

Plus everything currently in `cloud/.env.example` that any route reads via `c.env.<NAME>` — please mirror the env-vars list when you do the wrangler.toml pass.

## Cron schedules (pulled from `cloud/vercel.json`)

Translate these into `wrangler.toml [triggers]` cron entries. The
dispatcher in `src/lib/cron.ts` (`CRON_FANOUT`) maps each schedule to
the routes that should fire.

```
0 0 * * *      api/cron/container-billing,         api/cron/release-pending-earnings
0 1 * * *      api/cron/compute-metrics
0 2 * * *      api/cron/cleanup-webhook-events
0 * * * *      api/cron/milady-billing
*/5 * * * *    api/cron/social-automation, api/cron/sample-eliza-price,
               api/cron/process-redemptions, api/cron/cleanup-stuck-provisioning
*/10 * * * *   api/cron/cleanup-expired-crypto-payments
*/15 * * * *   api/cron/auto-top-up, api/cron/agent-budgets,
               api/v1/cron/refresh-model-catalog
* * * * *      api/v1/cron/deployment-monitor, api/v1/cron/health-check
0 */6 * * *    api/cron/cleanup-anonymous-sessions
```

`wrangler.toml` only allows up to 3 cron triggers per Worker on the free
plan — paid is required for the full set. Document this when you wire it.

## Open questions for Agent A (frontend)

- **CORS allowed origins** — current scaffold uses `Access-Control-Allow-Origin: *`. If the SPA depends on cookies (Privy session), wildcard origin won't work. Confirm whether the Vite SPA needs a strict allowlist with `Access-Control-Allow-Credentials: true`.
- **Cookie domain** — `proxy.ts` sets cookies path-scoped (`Path=/`) without an explicit domain. After split, the SPA and API may live on different subdomains. Confirm the canonical pair (e.g. `app.elizacloud.ai` + `api.elizacloud.ai`) so we set `Domain=.elizacloud.ai` on session cookies.
- **`steward-token` refresh flow** — currently lives in `cloud/proxy.ts` and pre-emptively refreshes when TTL < 180s. Not yet ported (low value if Privy is the primary auth). Confirm whether Steward auth is still in scope.

## Conversion cheatsheet (for the next contributor)

| Next.js | Hono |
|---------|------|
| `req: NextRequest` | `c: AppContext` (typed via `AppEnv`) |
| `req.json()` | `await c.req.json()` |
| `req.headers.get(x)` | `c.req.header(x)` |
| `req.nextUrl.searchParams.get(x)` | `c.req.query(x)` |
| `NextResponse.json(b, { status })` | `c.json(b, status)` |
| `cookies().get(x)?.value` | `getCookie(c, x)` (`hono/cookie`) |
| `cookies().set(x, v, opts)` | `setCookie(c, x, v, opts)` |
| `cookies().delete(x)` | `deleteCookie(c, x)` |
| `process.env.X` | `c.env.X` (add to `Bindings`!) |
| `withRateLimit(handler, preset)` | `app.use("*", rateLimit(preset)); app.post("/", handler)` |
| `getCurrentUser()` | `await getCurrentUser(c)` from `@/api-lib/auth` (NOT `@/lib/auth`) |
| `requireAuthOrApiKeyWithOrg(req)` | `await requireUserOrApiKeyWithOrg(c)` from `@/api-lib/auth` |
| dynamic `[id]` | `:id` — read with `c.req.param("id")` |
| dynamic `[...slug]` | `*` — read with `c.req.param("*")` |
| `next/cache` `revalidatePath` etc. | drop — no equivalent on Workers; mark `// TODO(cache)` |

The conversion shape is always:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../../src/lib/context";
import { rateLimit, RateLimitPresets } from "../../src/lib/rate-limit";

const app = new Hono<AppEnv>();
app.use("*", rateLimit(RateLimitPresets.STANDARD));
app.post("/", async (c) => {
  const body = await c.req.json();
  // ...
  return c.json({ ok: true });
});
export default app;
```

After adding or removing routes, run `bun run codegen` from `cloud/api/`
to refresh `_router.generated.ts`.

## Known shared-lib hazards

`@/lib/services/*` modules largely avoid Next-only APIs, but a few
import `next/headers` or the React `cache` helper transitively. When a
route conversion blows up at typecheck or runtime with a Next import in
the trace, the fix is usually:

1. Avoid importing the bad service in the route handler.
2. Inline the small DB query the route actually needs.
3. Or ask for the upstream `packages/lib/*` file to be split (file an
   issue rather than editing it — that area is owned elsewhere per the
   agent boundaries in the brief).
