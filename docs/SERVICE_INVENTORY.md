# Service Inventory

> Last updated: 2026-03-19

## shad0wbot VPS (188.245.252.86) — PM2 Services

All services managed via PM2 as user `shad0w`.

### eliza-cloud-ui-3000
- **What:** Eliza Cloud Next.js app (production build)
- **Port:** 3000
- **Codebase:** `/home/shad0w/projects/eliza-cloud-v2-milady-pack`
- **Config:** `ecosystem.config.js`
- **Env:** `.env.local` (loaded by Next.js)
- **Build:** `bun run build` (outputs to `.next-build`)
- **Check:** `pm2 status eliza-cloud-ui-3000` or `curl http://localhost:3000/api/health`
- **Restart:** `pm2 restart eliza-cloud-ui-3000`
- **Logs:** `pm2 logs eliza-cloud-ui-3000 --lines 50`
- **Notes:** Uses `NEXT_DIST_DIR=.next-build`. Connects to Neon DB, Upstash Redis, Headscale (localhost:8081 — likely tunneled or needs updating).

### cloudflared (Primary Tunnel)
- **What:** Cloudflare Tunnel for `milady-api.*`, `*.shad0w.xyz`
- **Tunnel ID:** `09526176-df95-4205-8e4b-621b0feb7228`
- **Config:** `~/.cloudflared/config.yml`
- **Check:** `pm2 status cloudflared`
- **Restart:** `pm2 restart cloudflared`
- **Logs:** `pm2 logs cloudflared --lines 50`

### cloudflared-milady-api (Secondary Tunnel)
- **What:** Cloudflare Tunnel for `milady-api.shad0w.xyz`, `*.shad0w.xyz`, `*.waifu.fun`
- **Tunnel ID:** `08a2da3d-4882-479d-82df-eb886603447c`
- **Config:** `~/.cloudflared/config-milady-api.yml`
- **Check:** `pm2 status cloudflared-milady-api`
- **Restart:** `pm2 restart cloudflared-milady-api`
- **Logs:** `pm2 logs cloudflared-milady-api --lines 50`

### milady-discord-bot
- **What:** Discord bot for milady cloud
- **Codebase:** `/home/shad0w/projects/milady-cloud/discord-bot/index.js`
- **Runtime:** Node.js
- **Check:** `pm2 status milady-discord-bot`
- **Restart:** `pm2 restart milady-discord-bot`
- **Notes:** Uptime 10+ days, stable

### homepage-3003
- **What:** waifu.fun homepage (dev server)
- **Port:** 3003
- **Command:** `bun run dev -- --port 3003 --host 0.0.0.0`
- **Check:** `pm2 status homepage-3003` or `curl http://localhost:3003`
- **Restart:** `pm2 restart homepage-3003`
- **Notes:** Running in dev mode (not production build)

### milady-api (STOPPED)
- **What:** Legacy milady backend
- **Status:** Stopped, 165k+ restart attempts
- **Notes:** Defunct. Do not restart. Functionality migrated to Eliza Cloud.

---

## milady VPS (89.167.63.246) — Infrastructure Services

### Headscale
- **What:** VPN coordination server (open-source Tailscale control plane)
- **Port:** 8081
- **User:** `milaidy`
- **Check:** `curl http://89.167.63.246:8081/health` (from VPN or locally)
- **API Key:** `hskey-api-2QYj...` (stored in `.env.local`)
- **Notes:** Manages VPN mesh for all agent containers

### nginx (Agent Router)
- **What:** Reverse proxy + Lua-powered agent router
- **Port:** 8080 (wildcard agents), 80 (legacy backend)
- **Config:** `/etc/nginx/` on milady VPS
- **Agent wildcard config:** `milady-cloud/backend/nginx/agents-wildcard`
- **Lua router:** `milady-cloud/backend/nginx/agent-router.lua`
- **Check:** `curl http://89.167.63.246:8080/nginx-health`
- **Restart:** `sudo systemctl restart nginx` (on milady VPS)
- **Notes:** Routes `{uuid}.shad0w.xyz` → headscale IP:port via DB lookup

### Docker Registry
- **What:** Private Docker image registry
- **Port:** 5000
- **URL:** `89.167.63.246:5000`
- **Storage:** `/opt/docker-registry`
- **Check:** `curl http://89.167.63.246:5000/v2/_catalog`
- **Notes:** HTTP only (not HTTPS). Docker nodes configured with `insecure-registries`.

### agent-lookup bridge
- **What:** Lightweight service that reads `milady_sandboxes` → returns headscale IP:port
- **Port:** 3456
- **Check:** `curl http://89.167.63.246:3456/agents`
- **Notes:** Used by nginx Lua router for agent routing

### Legacy Backend
- **What:** Original milady-cloud backend
- **Port:** 3000
- **Notes:** Fallback for agent routing. Being replaced by Eliza Cloud.

---

## Docker Nodes — Agent Containers

### agent-node-1 (37.27.190.196)
- **Manager:** Docker engine
- **SSH Access:** `ssh -i /root/.ssh/clawdnet_nodes root@37.27.190.196` (from milady VPS)
- **Capacity:** 8 containers
- **Status:** Healthy
- **Check containers:** `docker ps` (via SSH)
- **Check status:** Query `docker_nodes` table for `node_id='agent-node-1'`
- **Port ranges:** bridge 18790-19790, web UI 20000-25000
- **Registry:** `insecure-registries: ["89.167.63.246:5000"]`

### nyx-node (89.167.49.4)
- **Manager:** Docker engine
- **SSH Access:** `ssh -i /root/.ssh/clawdnet_nodes root@89.167.49.4` (from milady VPS)
- **Capacity:** 8 containers
- **Status:** **OFFLINE** — SSH connection refused
- **Notes:** Needs investigation. Marked `unhealthy` in DB.

---

## Vercel — Eliza Cloud Frontend

- **Project:** `eliza-cloud-v2`
- **Team:** `team_5JEpO4iusbqhbhqTPHg11Lmt`
- **URL:** `www.dev.elizacloud.ai`
- **Check:** `vercel ls` or visit URL
- **Deploy:** `vercel --prod` or push to main branch
- **Cron Jobs (16):**
  - `container-billing` — daily at 00:00 UTC
  - `milady-billing` — hourly
  - `social-automation` — every 5 min
  - `auto-top-up` — every 15 min
  - `deployment-monitor` — every minute
  - `health-check` — every minute
  - `process-provisioning-jobs` — every minute
  - `sample-eliza-price` — every 5 min
  - `process-redemptions` — every 5 min
  - `agent-budgets` — every 15 min
  - `release-pending-earnings` — daily at 00:00 UTC
  - `cleanup-anonymous-sessions` — every 6 hours
  - `cleanup-expired-crypto-payments` — every 10 min
  - `cleanup-webhook-events` — daily at 02:00 UTC
  - `compute-metrics` — daily at 01:00 UTC
  - `refresh-model-catalog` — every 15 min

---

## GitHub Actions CI/CD (Existing)

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `tests.yml` | PR/push to dev/main | Lint, typecheck, unit/integration/property/runtime/e2e tests, build |
| `gateway-discord.yml` | Changes to gateway-discord paths | Terraform infra + Docker build + Helm deploy to EKS |
| `gateway-webhook.yml` | Changes to gateway-webhook paths | Test gateway-webhook service |
| `claude-code-review.yml` | ? | Claude AI code review |
| `claude.yml` | ? | Claude AI assistance |

### Docker Images

| Image | Registry | Build Process |
|-------|----------|---------------|
| `milady/agent:cloud-full-ui` | `89.167.63.246:5000` (private) | Manual build on VPS from `milady-ai/milady` repo |
| `ghcr.io/elizaos/cloud/gateway-discord` | GHCR | Automated via `gateway-discord.yml` |
| `ghcr.io/{owner}/agent` | GHCR | Prepared workflow in `milady-cloud-ci/` (not yet active) |

---

## Quick Status Check Script

```bash
#!/bin/bash
# Run on shad0wbot VPS to check all services

echo "=== PM2 Services ==="
pm2 list

echo ""
echo "=== Eliza Cloud Health ==="
curl -s http://localhost:3000/api/health | jq . 2>/dev/null || echo "FAILED"

echo ""
echo "=== Homepage ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/ 2>/dev/null || echo "FAILED"

echo ""
echo "=== Headscale ==="
curl -s http://localhost:8081/health 2>/dev/null || echo "UNREACHABLE (may need tunnel)"

echo ""
echo "=== Docker Registry ==="
curl -s http://89.167.63.246:5000/v2/_catalog 2>/dev/null || echo "UNREACHABLE"
```
