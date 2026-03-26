# Infrastructure Overview

This document describes the deployment architecture for elizaOS/cloud, with a clear separation
of concerns between Vercel (frontend/billing) and the Milady VPS (container lifecycle).

---

## Ownership Split

| Concern                     | Owner     | Notes                                      |
|-----------------------------|-----------|--------------------------------------------|
| Frontend dashboard          | Vercel    | Next.js SSR via `vercel.json`              |
| User auth (Privy)           | Vercel    | `/api/auth/*` routes                       |
| Billing crons               | Vercel    | See retained crons in `vercel.json`        |
| Container provisioning      | **VPS**   | `milady-provisioning-worker` systemd unit  |
| Container health checks     | **VPS**   | Polled by provisioning worker              |
| Deployment monitor          | **VPS**   | Polled by provisioning worker              |
| SSH to docker nodes         | **VPS**   | Uses `/root/.ssh/clawdnet_nodes`           |

---

## Components

### Vercel (frontend + billing)

- **URL**: https://cloud.elizaos.ai (production)
- **Crons retained** (DB operations only, safe to run on Vercel):
  - `/api/cron/milady-billing` — hourly usage billing
  - `/api/cron/container-billing` — daily container cost rollup
  - `/api/cron/auto-top-up` — auto top-up credits
  - `/api/cron/social-automation` — social media posting
  - `/api/cron/sample-eliza-price` — price sampling
  - `/api/cron/process-redemptions` — credit redemptions
  - `/api/cron/agent-budgets` — budget enforcement
  - `/api/cron/release-pending-earnings` — creator payouts
  - `/api/cron/cleanup-*` — stale record cleanup
  - `/api/cron/compute-metrics` — analytics
  - `/api/v1/cron/refresh-model-catalog` — model list sync
- **Crons removed** (moved to VPS):
  - `/api/v1/cron/process-provisioning-jobs` → `milady-provisioning-worker`
  - `/api/v1/cron/health-check` → `milady-provisioning-worker`
  - `/api/v1/cron/deployment-monitor` → `milady-provisioning-worker`

### Milady VPS (`89.167.63.246`)

- **OS**: Ubuntu (root managed)
- **Services**:
  - `eliza-cloud` (systemd) — Next.js app on port 3000, serves API routes called by VPS crons
  - `milady-provisioning-worker` (systemd) — owns all container lifecycle operations
- **Config**: `/opt/eliza-cloud/.env.local`
- **Deploy**: triggered by `deploy-backend.yml` GitHub Actions workflow on push to `main`/`dev`
- **Steward sidecar**: `http://localhost:3200` (Docker bridge: `http://172.18.0.1:3200`)

### Docker Nodes

Six bare-metal/VM nodes running eliza agent containers:

| Host           | Role                        |
|----------------|-----------------------------|
| milady-core-1  | Agent container node        |
| milady-core-2  | Agent container node        |
| milady-core-3  | Agent container node        |
| milady-core-4  | Agent container node        |
| milady-core-5  | Agent container node        |
| milady-core-6  | Agent container node        |

- Container image: `ghcr.io/milady-ai/agent:v2.0.0-steward-8`
- Base domain: `milady.ai` — agents accessible at `<agent-id>.milady.ai`
- Bridge port: `2138` (`MILADY_BRIDGE_INTERNAL_PORT`)
- SSH access via `MILADY_SSH_KEY` (base64 RSA) + `MILADY_SSH_USER=root`

### Neon DB (PostgreSQL)

- **Provider**: Neon (serverless Postgres)
- **Shared between**: Vercel and VPS (same `DATABASE_URL`)
- **Migrations**: run automatically by `deploy-backend.yml` before deploy
- **API access**: `NEON_API_KEY` used for project-level operations (branch creation, etc.)

### Redis (Upstash)

- **Provider**: Upstash (`apt-bass-23833.upstash.io`)
- **Shared between**: Vercel and VPS
- **Connection**: `REDIS_URL` / `KV_URL` — TLS (`rediss://`)
- **Rate limiting**: enabled (`REDIS_RATE_LIMITING=true`)
- **Note**: env vars are now synced between Vercel and VPS to prevent drift

---

## GitHub Actions Secrets Required

The `deploy-backend.yml` workflow requires these secrets on the `elizaOS/cloud` repo:

| Secret              | Description                                 | Status      |
|---------------------|---------------------------------------------|-------------|
| `MILADY_VPS_HOST`   | VPS IP or hostname (`89.167.63.246`)        | ⚠️ MISSING  |
| `MILADY_VPS_SSH_KEY`| SSH private key for `deploy` user on VPS   | ⚠️ MISSING  |
| `NEON_DATABASE_URL` | Neon connection string for migrations       | ⚠️ MISSING  |
| `DISCORD_WEBHOOK`   | Discord webhook for deploy notifications    | ⚠️ MISSING  |

> **Action required**: Add the above secrets in GitHub → Settings → Secrets and variables → Actions.

---

## Deployment Flow

```
git push main
    │
    ▼
GitHub Actions: deploy-backend.yml
    │
    ├── Run DB migrations (Neon)
    │
    └── SSH to VPS
            ├── git pull
            ├── bun install && bun run build
            ├── systemctl restart eliza-cloud
            └── systemctl restart milady-provisioning-worker
```

---

## Environment Variable Sync

To update VPS env vars when production secrets change:

```bash
ssh -i ~/.ssh/id_ed25519 root@89.167.63.246
vim /opt/eliza-cloud/.env.local
sudo systemctl restart eliza-cloud milady-provisioning-worker
```

Production env reference: `.env.production` in repo root (Vercel CLI managed, not committed).
