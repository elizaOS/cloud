# eliza-cloud — Cloudflare Deployment

This document covers the Cloudflare-based deployment of the eliza-cloud
SPA + API after the migration off Vercel/Next.js. It is the operator
runbook for first-time setup, day-to-day dev, deploys, and rollback.

---

## Architecture

```
                         ┌────────────────────────┐
                         │  api.elizacloud.ai     │
                         │  (Cloudflare Workers)  │
                         │  eliza-cloud-api-prod  │
                         └───────────┬────────────┘
                                     │
   ┌────────────┐   /api/*           │
   │ elizacloud │──────► (rewrite)───┘
   │   .ai      │
   │ (Pages)    │
   │ eliza-cloud│
   └────────────┘
        │
        ├──► Neon Postgres                (DATABASE_URL)
        ├──► Cloudflare R2 (BLOB)         (replaces @vercel/blob)
        ├──► Cloudflare KV (SESSION_CACHE / RATE_LIMIT / CACHE)
        ├──► Upstash Redis                (KV_REST_API_URL/_TOKEN — optional fallback)
        └──► AWS ECS                      (long-running container deploys for user agents)
```

| Surface          | Where it runs                | Source                  |
| ---------------- | ---------------------------- | ----------------------- |
| SPA (frontend)   | Cloudflare Pages             | `cloud/frontend/`       |
| API              | Cloudflare Workers           | `cloud/api/`            |
| DB               | Neon (NA primary + EU read)  | external                |
| Blob storage     | Cloudflare R2 (`BLOB`)       | binding in wrangler.toml|
| Session/cache/RL | Cloudflare KV                | bindings in wrangler.toml|
| Cache fallback   | Upstash Redis (REST)         | secrets                 |
| Crons            | Workers `[triggers].crons`   | `cloud/api/wrangler.toml` |

### Long-running services NOT migrated

These stay on their existing hosts because Workers' execution model
does not fit them:

- **`services/agent-server`** — long-lived per-user agent process.
  Stays on Railway / GCP / Hetzner. Built and shipped as a Docker
  container. The Workers API hands off to it via the existing ECS
  deploy flow (`/api/v1/containers/*`).
- **`packages/services/gateway-discord`** — long-lived Discord
  websocket gateway. Stays on a Node host. Communicates with the
  Workers API via JWT (`JWT_SIGNING_*` keys) and the internal
  shared-secret endpoints.
- **`packages/services/gateway-webhook`** — currently a Node service.
  Could be migrated to a Worker as a follow-up; not urgent.

---

## One-time bootstrap

Required tooling: `wrangler` (`bun add -g wrangler` or `bunx wrangler`),
`bun`, and a Cloudflare account.

```bash
# 1. Authenticate wrangler
wrangler login
wrangler whoami     # confirm account ID — paste into cloud/api/wrangler.toml

# 2. Create Cloudflare resources (idempotent)
bun run cf:bootstrap

# 3. Open cloud/api/wrangler.toml and replace each REPLACE_ME:
#    - account_id           = "<your-account-id>"
#    - kv_namespaces[*].id  = "<id printed by step 2>"
#    - kv_namespaces[*].preview_id = "<preview id printed by step 2>"

# 4. Push secrets from a populated dotenv file. Use real production
#    values. The script skips NEXT_PUBLIC_/VITE_ keys (those are
#    build-time and live in CI as build env vars).
bun run cf:secrets:put:staging  --   ./.env.staging
bun run cf:secrets:put:prod     --   ./.env.production

# 5. First deploy
bun run cf:deploy
```

### DNS

Point the following records at Cloudflare:

| Hostname                          | Target                                |
| --------------------------------- | ------------------------------------- |
| `elizacloud.ai`, `www.elizacloud.ai` | Pages project `eliza-cloud` (custom domain) |
| `api.elizacloud.ai`               | Worker `eliza-cloud-api-prod` route   |
| `api-staging.elizacloud.ai`       | Worker `eliza-cloud-api-staging` route|

Cloudflare's dashboard handles cert provisioning automatically once the
domain is on Cloudflare DNS.

---

## Day-to-day development

```bash
# From cloud/
bun run cf:dev
# ...starts:
#   - wrangler dev for the API on http://localhost:8787
#   - vite dev for the SPA on http://localhost:5173
# The frontend's vite.config.ts should proxy /api/* to :8787 in dev.
```

If only working on one half, run them individually:

```bash
cd cloud/api      && wrangler dev
cd cloud/frontend && bun run dev
```

Tail live Worker logs:

```bash
bun run cf:tail            # production
bun run cf:tail staging
bun run cf:tail pr-123
```

---

## Deployment

GitHub Actions handles all deploys (`.github/workflows/cf-deploy.yml`):

| Trigger              | Worker env             | Pages target              |
| -------------------- | ---------------------- | ------------------------- |
| push `develop`       | `staging`              | Pages branch `develop`    |
| push `main`          | `production`           | Pages production          |
| `pull_request`       | `eliza-cloud-api-pr-N` | Pages branch `<PR head>`  |

Required GitHub repo secrets:

- `CLOUDFLARE_API_TOKEN` — account-scoped, Workers + Pages edit perms
- `CLOUDFLARE_ACCOUNT_ID` — must match `cloud/api/wrangler.toml`

---

## Cron triggers

Ported 1:1 from the previous `cloud/vercel.json`. The Worker maps the
schedule string in `event.cron` to the matching handler under
`api/cron/*` or `api/v1/cron/*`.

| Schedule      | Handler                                  |
| ------------- | ---------------------------------------- |
| `0 0 * * *`   | `api/cron/container-billing`             |
| `0 * * * *`   | `api/cron/milady-billing`                |
| `*/5 * * * *` | `api/cron/social-automation`             |
| `*/15 * * * *`| `api/cron/auto-top-up`                   |
| `* * * * *`   | `api/v1/cron/deployment-monitor`         |
| `* * * * *`   | `api/v1/cron/health-check`               |
| `*/5 * * * *` | `api/cron/sample-eliza-price`            |
| `*/5 * * * *` | `api/cron/process-redemptions`           |
| `*/15 * * * *`| `api/cron/agent-budgets`                 |
| `0 0 * * *`   | `api/cron/release-pending-earnings`      |
| `*/5 * * * *` | `api/cron/cleanup-stuck-provisioning`    |
| `0 */6 * * *` | `api/cron/cleanup-anonymous-sessions`    |
| `*/10 * * * *`| `api/cron/cleanup-expired-crypto-payments` |
| `0 2 * * *`   | `api/cron/cleanup-webhook-events`        |
| `0 1 * * *`   | `api/cron/compute-metrics`               |
| `*/15 * * * *`| `api/v1/cron/refresh-model-catalog`      |

Note: Workers' cron dispatcher runs *all* matching crons for a given
schedule string — if two handlers share a schedule (`*/5 * * * *` here
maps to four), the Worker must read the request URL or a per-handler
hint from a separate dispatch table. Agent B owns that dispatcher; if a
schedule needs to be unique, split into separate triggers and add a
distinguishing comment.

---

## Bundle size

Workers Paid plan caps a single Worker at ~10 MiB compressed. Watch the
`Total Upload` line on every `wrangler deploy`. If approached, split
the API into multiple Workers per route group:

- `eliza-cloud-api-auth`     — `/api/auth/*`, `/api/privy/*`, `/api/sessions/*`
- `eliza-cloud-api-billing`  — `/api/stripe/*`, `/api/credits/*`, `/api/cron/*billing*`
- `eliza-cloud-api-agents`   — `/api/agents/*`, `/api/v1/containers/*`
- `eliza-cloud-api-misc`     — everything else

Cloudflare's "Service bindings" let one Worker call another in-region,
so cross-Worker fan-out adds zero network cost.

---

## Rollback

- **API**: `wrangler rollback --env production` (interactive — pick a
  prior deploy ID).
- **Pages**: in the dashboard, navigate to the project → Deployments →
  pick a prior deploy → "Rollback to this deployment".
- **Crons**: rolling back the Worker rolls back its triggers automatically.

Both rollbacks are atomic. Database/migrations are not — handle those
separately.

---

## Placeholders the operator must fill

These ship as `REPLACE_ME` and block first deploy until set:

| File                          | Field                          | Source                              |
| ----------------------------- | ------------------------------ | ----------------------------------- |
| `cloud/api/wrangler.toml`     | `account_id`                   | `wrangler whoami`                   |
| `cloud/api/wrangler.toml`     | `kv_namespaces[*].id`          | output of `cf:bootstrap`            |
| `cloud/api/wrangler.toml`     | `kv_namespaces[*].preview_id`  | output of `cf:bootstrap`            |
| GitHub repo settings          | `CLOUDFLARE_API_TOKEN` secret  | Cloudflare dash → API Tokens        |
| GitHub repo settings          | `CLOUDFLARE_ACCOUNT_ID` secret | same as wrangler.toml `account_id`  |
| Cloudflare dash               | DNS records for the three hosts above | self                         |

Plus the wrangler-secret list in the comments of `cloud/api/wrangler.toml`
— push those via `cf:secrets:put:*`.

---

## Routing choice (`/api/*`)

The Pages `_redirects` file proxies `/api/*` to the Workers host via a
`200` rewrite, so the browser sees same-origin requests and skips the
CORS preflight. The Worker still has permissive CORS headers in case
the frontend wants to call it directly (e.g. from the desktop app or
a third-party app), but day-to-day the SPA goes through the rewrite.

---

## Notes for parallel agents

- **Agent A (frontend)**: the `_headers` CSP bakes in
  `https://elizacloud.ai` as the SPA origin and includes
  `https://api.elizacloud.ai` in `connect-src`. If the SPA needs to
  fetch any other origin not present in `cloud/next.config.ts`'s CSP,
  add it to `cloud/frontend/public/_headers` and ping infra.
- **Agent B (API)**: secret names in `cloud/api/wrangler.toml`
  (comments) come from `cloud/.env.example`. If the Worker code
  references `c.env.X` under a different name, treat the Worker code
  as canonical and update the comment block + the migrate script's
  filtering. Drop a note in this section when that happens.

---

## Known gaps / follow-ups

- `cloud/vercel.json` and `cloud/next.config.ts` are still on disk for
  reference; remove once the Workers/Pages path is confirmed in prod.
- `proxy.ts` (sandbox postMessage proxy) and `services/agent-server`
  remain on the existing host stack.
- `gateway-webhook` could move to a Worker; out of scope for this pass.
