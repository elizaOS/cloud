# API → Hono / Cloudflare Workers migration notes

This file is the running ledger for the Next.js → Hono conversion. It is
the coordination surface with Agent A (frontend) and Agent C (infra).
Update it as you convert routes.

## Status

- **Scaffold**: complete. `cloud/api/package.json`, `tsconfig.json`,
  `src/index.ts`, `src/lib/{context,auth,db,rate-limit,cookies,cors,errors,cron}.ts`,
  `src/middleware/auth.ts`, and `src/_generate-router.mjs` are all in
  place. `src/_router.generated.ts` is regenerated from the file tree.
- **Codegen**: walks `cloud/api/`, only mounts leaves whose source
  contains `from "hono"`. Unconverted routes fall through to the global
  404 — they remain inert without crashing the worker.
- **Cron dispatcher**: `src/lib/cron.ts` maps each `vercel.json` schedule
  to the routes that should fire and runs them via `app.fetch` so the
  same code path serves both web and scheduled invocations.
- **Auth middleware**: `src/middleware/auth.ts` is a Hono port of
  `cloud/proxy.ts`. Mounted globally before the router. Reads
  `privy-token` cookie, verifies via `@privy-io/server-auth`, caches in
  Upstash, sets `c.set("user", ...)`. Programmatic auth (X-API-Key /
  Bearer eliza_*) passes through to the route handler for validation.

## Conversion progress

| Group | Total | Hono | Stubbed (501) |
|---|---:|---:|---:|
| .well-known | 1 | 1 | 0 |
| a2a | 1 | 0 | 0 |
| admin | 1 | 0 | 0 |
| affiliate | 2 | 0 | 0 |
| agents | 3 | 0 | 0 |
| analytics | 2 | 2 | 0 |
| anonymous-session | 1 | 1 | 0 |
| auth | 11 | 11 | 0 |
| auto-top-up | 1 | 1 | 0 |
| characters | 2 | 0 | 1 |
| compat | 10 | 0 | 0 |
| credits | 2 | 2 | 0 |
| cron | 15 | 4 | 0 |
| crypto | 5 | 2 | 0 |
| elevenlabs | 8 | 1 | 2 |
| eliza | 5 | 0 | 0 |
| eliza-app | 17 | 0 | 0 |
| fal | 1 | 1 | 0 |
| feedback | 1 | 1 | 0 |
| health | 1 | 1 | 0 |
| internal | 11 | 0 | 0 |
| invites | 2 | 2 | 0 |
| invoices | 2 | 2 | 0 |
| mcp | 6 | 0 | 1 |
| mcps | 20 | 0 | 17 |
| my-agents | 10 | 0 | 0 |
| og | 1 | 0 | 1 |
| openapi.json | 1 | 1 | 0 |
| organizations | 4 | 4 | 0 |
| privy | 1 | 0 | 0 |
| quotas | 1 | 1 | 0 |
| sessions | 1 | 1 | 0 |
| set-anonymous-session | 1 | 1 | 0 |
| signup-code | 1 | 1 | 0 |
| stats | 1 | 1 | 0 |
| stripe | 3 | 1 | 0 |
| test | 1 | 1 | 0 |
| training | 5 | 0 | 1 |
| v1 | 317 | 0 | 4 |
| webhooks | 3 | 0 | 0 |
| **TOTAL** | **482** | **44** | **27** |

44 routes fully converted (≈9% of leaves, weighted toward auth,
billing, analytics, organizations, cron — i.e. the URLs the SPA hits
most). 27 routes are stubbed at 501 because they import packages that
don't run on Workers (see next section). The remaining 411 are
left as-is in the file tree and do NOT fall over the worker — the
codegen skips any leaf that hasn't yet been ported to Hono. They show
up as a 404 from the global handler.

To pick up where this left off: open `MIGRATION_NOTES.md`, look at the
groups with Hono = 0 from the table above, run `bun run codegen` after
each leaf you convert, and commit per group. The "Conversion
cheatsheet" at the bottom is the actual playbook.

## Node-only blockers — need sidecar service

Routes that import packages or APIs that do not run on Cloudflare
Workers. These have been replaced with a 501 stub that preserves the URL
and the mount in the router. Original logic is kept in git history. To
re-enable, either move to a Node sidecar or replace the offending
import with a Workers-friendly equivalent.

| Route | Offending import | Suggested approach |
|-------|------------------|--------------------|
| `api/og/route.tsx` | `next/og` (`ImageResponse`) | Node sidecar or Cloudflare Image Resizing |
| `api/v1/containers/[id]/metrics/route.ts` | `@aws-sdk/client-cloudwatch` | Node service that fronts AWS |
| `api/v1/containers/[id]/logs/route.ts` | `@aws-sdk/client-cloudwatch-logs` | same |
| `api/v1/containers/[id]/logs/stream/route.ts` | `@aws-sdk/client-cloudwatch-logs` | same |
| `api/v1/cron/deployment-monitor/route.ts` | `@aws-sdk/client-cloudformation` | same |
| `api/characters/[characterId]/mcps/route.ts` | `@elizaos/plugin-mcp` | call `services/agent-server` |
| `api/training/vertex/tune/route.ts` | `node:fs` | move to sidecar |
| `api/mcp/route.ts` and 17 routes under `api/mcps/*` | `mcp-handler` | mcp-handler triggers an undici polyfill conflict (see `proxy.ts` comment) and assumes Node streaming. Either run a separate MCP worker that uses Hono's MCP adapter, or move the entire `/api/mcps/*` surface to a Node service. |

`grep -rl "@elizaos/plugin-\|@aws-sdk\|@vercel/blob\|@vercel/sandbox\|mcp-handler\|next/og" api/ --include='route.ts'` will refresh the list.

Other groups still containing Node-only imports that I haven't fully
audited yet:

- `api/v1/reports/bug/route.ts` — `node:fs/promises`
- `api/v1/app-builder/sessions/[sessionId]/terminal/route.ts` — `node:child_process`
- `api/v1/remote/pair/route.ts` — `node:child_process`
- `api/agents/[id]/headscale-ip/route.ts` — `node:child_process`
- `api/crypto/webhook/route.ts` — `node:fs/promises` (key load — replace with env or R2)

## Env / bindings Agent C needs to add to `wrangler.toml`

Read from `c.env` somewhere in the converted routes. Secrets should use
`wrangler secret put`.

- `DATABASE_URL` (Neon pooled) — secret
- `DATABASE_URL_UNPOOLED` (optional) — secret
- `NEXT_PUBLIC_PRIVY_APP_ID` — var
- `PRIVY_APP_SECRET` — secret
- `STEWARD_API_URL` — var (default `https://eliza.steward.fi`)
- `STEWARD_JWT_PUBLIC_KEY` — secret (only if Steward JWT verification stays in this Worker)
- `KV_REST_API_URL` — var (Upstash REST URL)
- `KV_REST_API_TOKEN` — secret
- `STRIPE_SECRET_KEY` — secret
- `STRIPE_WEBHOOK_SECRET` — secret (when stripe/webhook is converted)
- `CRON_SECRET` — secret (shared between scheduled() and `/api/cron/*` routes)
- `NEXT_PUBLIC_APP_URL` — var (used by openapi spec + cron internal calls)
- `NODE_ENV` — var (used to gate dev-only behavior)
- `ANON_SESSION_EXPIRY_DAYS` — var (default 7)
- `ANON_MESSAGE_LIMIT` — var (default 5)
- `PLAYWRIGHT_TEST_AUTH` — var (`true` in test env only)
- `RATE_LIMIT_DISABLED` / `RATE_LIMIT_MULTIPLIER` — var (dev only)

Plus everything currently in `cloud/.env.example` that any unported
route reads via `c.env.<NAME>` — please mirror that whole list when you
do the wrangler.toml pass, then we can audit which are actually used
post-port.

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

Workers free-plan only allows three cron triggers per Worker — paid is
required for the full set. Document this when wiring.

The four cleanup cron jobs already converted (`cleanup-cli-sessions`,
`cleanup-webhook-events`, `cleanup-priorities`,
`cleanup-expired-crypto-payments`) will work the moment cron triggers
fire and `CRON_SECRET` is set. The other 11 cron leaves still have
Next-shaped handlers; converting them is mostly mechanical because they
all follow the same pattern (verify cron secret, call a service method,
return JSON).

## Open questions for Agent A (frontend)

- **CORS allowed origins** — the scaffold uses `Access-Control-Allow-Origin: *`. If the SPA depends on cookies (Privy session), wildcard origin won't work and we need an allowlist with `Access-Control-Allow-Credentials: true`. Confirm the Vite dev origin and any production origins.
- **Cookie domain** — `proxy.ts` sets cookies path-scoped (`Path=/`) without an explicit domain. After the SPA / API split, we'll need `Domain=.elizacloud.ai` on session cookies so they survive the cross-subdomain request. Confirm the canonical pair (e.g. `app.elizacloud.ai` + `api.elizacloud.ai`).
- **Steward refresh flow** — The pre-emptive `steward-token` refresh in `cloud/proxy.ts` (refreshes if TTL < 180s) was intentionally left out of `src/middleware/auth.ts` to keep the first cut focused on Privy. Confirm whether Steward auth is still in scope; if so, port the refresh logic from `proxy.ts:tryRefreshStewardSession`.

## Conversion cheatsheet (for the next contributor)

| Next.js | Hono |
|---------|------|
| `req: NextRequest` | `c: AppContext` (typed via `AppEnv`) |
| `req.json()` | `await c.req.json()` |
| `req.text()` | `await c.req.text()` |
| `req.formData()` | `await c.req.formData()` |
| `req.headers.get(x)` | `c.req.header(x)` |
| `req.nextUrl.searchParams.get(x)` | `c.req.query(x)` |
| `NextResponse.json(b, { status })` | `c.json(b, status)` |
| `new NextResponse(blob, ...)` | `new Response(blob, ...)` (Hono is happy with raw `Response`) |
| `cookies().get(x)?.value` | `getCookie(c, x)` from `hono/cookie` |
| `cookies().set(x, v, opts)` | `setCookie(c, x, v, opts)` |
| `cookies().delete(x)` | `deleteCookie(c, x)` |
| `process.env.X` | `c.env.X` (and add to `Bindings`) |
| `withRateLimit(handler, preset)` | `app.use("*", rateLimit(preset)); app.<verb>("/", handler)` |
| `getCurrentUser()` | `await getCurrentUser(c)` from `@/api-lib/auth` (NOT `@/lib/auth`) |
| `requireAuthOrApiKeyWithOrg(req)` | `await requireUserOrApiKeyWithOrg(c)` from `@/api-lib/auth` |
| `requireAuthWithOrg()` | `await requireUserWithOrg(c)` |
| Cron secret check | `requireCronSecret(c)` |
| dynamic `[id]` | `:id` — read with `c.req.param("id")` |
| dynamic `[...slug]` | `*` — read with `c.req.param("*")` |
| `next/cache` (`revalidatePath`, `revalidateTag`) | drop — no equivalent on Workers; mark `// TODO(cache)` |
| `nextJsonFromCaughtError(e)` | `failureResponse(c, e)` |

The conversion shape is always:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../../src/lib/context";
import { rateLimit, RateLimitPresets } from "../../src/lib/rate-limit";
import { failureResponse } from "../../src/lib/errors";
import { requireUserOrApiKeyWithOrg } from "../../src/lib/auth";

const app = new Hono<AppEnv>();
app.use("*", rateLimit(RateLimitPresets.STANDARD));
app.post("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const body = await c.req.json();
    // ...
    return c.json({ ok: true });
  } catch (err) {
    return failureResponse(c, err);
  }
});
export default app;
```

After adding/removing/converting a route, run `bun run codegen` from
`cloud/api/` to refresh `_router.generated.ts`.

## Known shared-lib hazards

`@/lib/services/*` modules largely work on Workers (Drizzle + Neon HTTP)
but a few transitively pull `next/headers` or React `cache`. When a
conversion blows up at typecheck or runtime with a Next import in the
trace, the fix is one of:

1. Don't import the bad service in the route — inline the small DB
   query the route actually needs.
2. Replace the service with a thinner Workers-friendly call.
3. The shared lib lives in `cloud/packages/lib/*` which is owned by a
   different agent boundary per the brief — file an issue rather than
   editing it directly.

The single biggest hazard is `@/lib/auth.ts` itself. It uses `cookies()`
from `next/headers` and React `cache`. THAT IS WHY `src/lib/auth.ts`
(`@/api-lib/auth`) exists — never import `getCurrentUser` /
`requireAuth*` from `@/lib/auth` in a converted route.
