# Architecture Overview

> Last updated: 2026-03-19

## System Diagram

```
                        ┌─────────────────────────────────────┐
                        │         DNS / Cloudflare            │
                        │                                     │
                        │  waifu.fun          → Vercel        │
                        │  www.dev.elizacloud.ai → Vercel     │
                        │  milady-api.shad0w.xyz → CF Tunnel  │
                        │  milady-api.waifu.fun  → CF Tunnel  │
                        │  *.shad0w.xyz (agents)  → CF Tunnel │
                        │  *.waifu.fun  (agents)  → CF Tunnel │
                        └──────────┬──────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────────┐
              ▼                    ▼                         ▼
    ┌──────────────────┐  ┌─────────────────┐   ┌─────────────────┐
    │     Vercel        │  │  shad0wbot VPS  │   │   milady VPS    │
    │                   │  │ 188.245.252.86  │   │ 89.167.63.246   │
    │ Eliza Cloud UI    │  │                 │   │                 │
    │ (Next.js SSR)     │  │ cloudflared ×2  │   │ nginx (8080)    │
    │ Cron jobs         │  │ Eliza Cloud     │   │   agent router  │
    │                   │  │   (PM2, :3000)  │   │   (Lua + DB)    │
    │ Dev dashboard:    │  │ homepage (:3003) │   │ headscale (:8081│
    │ www.dev.          │  │ milady-discord  │   │ Docker registry │
    │ elizacloud.ai     │  │   -bot          │   │   (:5000)       │
    └──────────────────┘  │ milady-api      │   │ agent-lookup    │
                           │   (stopped)     │   │   bridge (:3456)│
                           └─────────────────┘   │ legacy backend  │
                                                  │   (:3000)       │
                                                  └────────┬────────┘
                                                           │
                              Headscale VPN Mesh            │
                    ┌──────────────────────────────────────┐│
                    │                                      ││
              ┌─────┴──────────┐  ┌─────────────────┐     ││
              │  agent-node-1  │  │    nyx-node      │     ││
              │ 37.27.190.196  │  │  89.167.49.4     │     ││
              │                │  │  (OFFLINE)        │     ││
              │ Docker engine  │  │  Docker engine    │     ││
              │ Agent containers│  │  Agent containers│     ││
              │ cap: 8         │  │  cap: 8           │     ││
              └────────────────┘  └──────────────────┘     │
                                                            │
                    ┌──────────────────┐                    │
                    │  milady-core-1   │ (Docker host,      │
                    │  88.99.66.168    │  build server)      │
                    └──────────────────┘
```

## Servers

### 1. shad0wbot VPS — `188.245.252.86` (This machine)

**Role:** Primary application host, Cloudflare tunnel entry point

| Service | Manager | Port | Purpose |
|---------|---------|------|---------|
| `eliza-cloud-ui-3000` | PM2 | 3000 | Eliza Cloud Next.js app (production build) |
| `cloudflared` | PM2 | — | CF Tunnel `09526176` → routes `milady-api.shad0w.xyz` etc. |
| `cloudflared-milady-api` | PM2 | — | CF Tunnel `08a2da3d` → routes `milady-api.*`, `*.shad0w.xyz`, `*.waifu.fun` |
| `milady-discord-bot` | PM2 | — | Discord bot (milady-cloud/discord-bot) |
| `homepage-3003` | PM2 | 3003 | waifu.fun homepage (bun dev) |
| `milady-api` | PM2 | — | Legacy backend (STOPPED, 165k+ restarts) |

**Cloudflare Tunnel Routing (config.yml):**
```
milady-api.shad0w.xyz → localhost:3000  (Eliza Cloud)
milady-api.waifu.fun  → localhost:3000  (Eliza Cloud)
milady.shad0w.xyz     → localhost:3000  (Eliza Cloud)
*.shad0w.xyz          → localhost:8080  (nginx agent router, proxied to milady VPS)
*.waifu.fun           → localhost:8080  (nginx agent router, proxied to milady VPS)
```

### 2. milady VPS — `89.167.63.246`

**Role:** Infrastructure control plane — headscale coordinator, nginx agent router, Docker registry

| Service | Manager | Port | Purpose |
|---------|---------|------|---------|
| Headscale | systemd? | 8081 | VPN coordination server for agent containers |
| nginx | systemd | 8080, 80 | Agent wildcard router (Lua + DB lookup) |
| Docker Registry | Docker | 5000 | Private registry for agent images (`89.167.63.246:5000`) |
| agent-lookup bridge | ? | 3456 | Reads `milady_sandboxes` table → returns headscale IP:port |
| Legacy backend | ? | 3000 | milady-cloud backend (fallback for agent routing) |

**nginx Agent Router Flow:**
1. Request arrives for `{uuid}.shad0w.xyz` or `{uuid}.waifu.fun`
2. `agent-router.lua` extracts UUID from subdomain
3. Queries agent-lookup bridge at `:3456` for headscale IP + web UI port
4. Falls back to legacy backend `:3000` then eliza-cloud-v2 `:3334`
5. Proxies to `headscale_ip:web_ui_port` on the VPN mesh
6. Special intercept: `/?token=...` → fetches real `MILADY_API_TOKEN` → returns JS page for sessionStorage

### 3. agent-node-1 — `37.27.190.196`

**Role:** Docker compute node for agent containers

- Capacity: 8 containers
- SSH access via milady VPS (`/root/.ssh/clawdnet_nodes` key)
- Docker engine with `insecure-registries: ["89.167.63.246:5000"]`
- Containers join Headscale VPN on boot via Tailscale auth keys
- Port ranges: bridge 18790-19790, web UI 20000-25000

### 4. nyx-node — `89.167.49.4`

**Role:** Docker compute node (CURRENTLY OFFLINE)

- Capacity: 8 containers
- SSH connection refused — marked `unhealthy` in DB
- Same configuration as agent-node-1

### 5. milady-core-1 — `88.99.66.168`

**Role:** Docker host / build server

- Used for building Docker images
- May run additional containers

## Network Architecture

### Cloudflare Tunnels

Two tunnels managed via PM2 on shad0wbot VPS:

| Tunnel ID | Config | Routes |
|-----------|--------|--------|
| `09526176-df95-4205-8e4b-621b0feb7228` | `~/.cloudflared/config.yml` | Primary: milady-api.*, *.shad0w.xyz |
| `08a2da3d-4882-479d-82df-eb886603447c` | `~/.cloudflared/config-milady-api.yml` | milady-api.shad0w.xyz, *.shad0w.xyz, *.waifu.fun |

### Headscale VPN Mesh

- **Coordinator:** milady VPS `:8081`
- **User:** `milaidy`
- **Flow:** New container → `prepareContainerVPN()` → ephemeral pre-auth key → container runs `tailscale up` → gets VPN IP
- **Routing:** nginx queries headscale IP from DB → proxies traffic directly over VPN

### DNS / Domain Routing

| Domain | Record | Target | Notes |
|--------|--------|--------|-------|
| `waifu.fun` | A | 216.198.79.1 | Unproxied, points to Vercel |
| `www.waifu.fun` | CNAME | Vercel | |
| `milady-api.shad0w.xyz` | CNAME | CF Tunnel (proxied) | Routes to Eliza Cloud |
| `*.shad0w.xyz` | CNAME | CF Tunnel (proxied) | Agent wildcard routing |
| `www.dev.elizacloud.ai` | — | Vercel | Eliza Cloud UI (primary deployment) |
| `cloud.milady.ai` | — | Railway (planned) | Production target |

### Vercel Deployments

- **Project:** `eliza-cloud-v2` (team: `team_5JEpO4iusbqhbhqTPHg11Lmt`)
- **Output dir:** `.next-build`
- **Cron jobs:** 16 scheduled endpoints (billing, health checks, provisioning, metrics)
- **Dev URL:** `www.dev.elizacloud.ai`

## Container Lifecycle

```
User creates agent via Eliza Cloud Dashboard
    │
    ▼
Eliza Cloud API → DockerSandboxProvider
    │
    ├── 1. Select node (least allocated from docker_nodes table)
    ├── 2. HeadscaleIntegration.prepareContainerVPN(agentId)
    │       → generates ephemeral pre-auth key
    ├── 3. SSH to docker node → docker pull + docker run
    │       → container gets: TS_AUTHKEY, TS_HOSTNAME, DATABASE_URL, etc.
    ├── 4. Container boots → tailscale up → joins VPN mesh
    ├── 5. HeadscaleIntegration.waitForVPNRegistration(agentId)
    │       → polls until node appears with IP
    ├── 6. Save to milady_sandboxes table (headscale_ip, ports, status)
    └── 7. Agent accessible at {agentId}.shad0w.xyz
```

## Database

- **Provider:** Neon (PostgreSQL with pgvector)
- **Pooled URL:** `ep-wild-dawn-a4c7r311-pooler.us-east-1.aws.neon.tech`
- **Key tables:**
  - `docker_nodes` — registered compute nodes (hostname, capacity, status)
  - `milady_sandboxes` — running containers (agent_id, headscale_ip, ports, node_id)
  - Standard SaaS tables (users, orgs, api_keys, credits, usage)
  - elizaOS runtime tables (agents, memories, rooms, embeddings)

## External Services

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| Neon | PostgreSQL database | `.env.local` DATABASE_URL |
| Upstash Redis | Cache, rate limiting, KV store | `.env.local` REDIS_URL, KV_REST_API_* |
| Privy | Authentication | `.env.local` PRIVY_* |
| Stripe | Billing | `.env.local` STRIPE_* |
| Vercel | Frontend hosting + cron | `.vercel/project.json` |
| Cloudflare | DNS, tunnels, DDoS protection | Tunnel configs in `~/.cloudflared/` |
| Vercel Blob | Media storage | `.env.local` BLOB_READ_WRITE_TOKEN |
| PostHog | Analytics | `.env.local` POSTHOG_* |
| SendGrid | Email | `.env.local` SENDGRID_* |
